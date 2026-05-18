import type { SupabaseClient } from "@supabase/supabase-js";

import { extractMentionedNodeIds } from "@/lib/chat/mention-extract";

export type LoadedNodeSummary = {
  id: string;
  title: string;
  node_level: string;
  system_prompt: string | null;
  core_summary: string | null;
  status: string;
};

function lc(id: string) {
  return id.toLowerCase();
}

async function fetchNodesByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<LoadedNodeSummary[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("nodes")
    .select(
      "id,title,node_level,system_prompt,core_summary,status"
    )
    .in("id", [...new Set(ids.map(lc))])
    .is("archived_at", null);

  if (error) {
    console.error("[chat] Failed to fetch nodes:", error.message);
    return [];
  }

  return (data ?? []) as LoadedNodeSummary[];
}

export async function buildGraphSystemAugmentation(
  supabase: SupabaseClient,
  userFacingText: string,
  opts?: { extraNodeIds?: string[] }
): Promise<string> {
  const fromCopy = extractMentionedNodeIds(userFacingText);
  const extras = opts?.extraNodeIds?.map(lc).filter(Boolean) ?? [];
  const mentionIds = [...new Set([...fromCopy, ...extras])];

  if (mentionIds.length === 0) {
    return "";
  }

  const mentionSet = new Set(mentionIds.map(lc));

  const primaryNodes = await fetchNodesByIds(supabase, mentionIds);
  const primaryById = new Map(primaryNodes.map((n) => [lc(n.id), n]));

  const { data: outbound, error: e1 } = await supabase
    .from("node_links")
    .select(
      "id,source_node_id,target_node_id,relationship_context,priority_weight"
    )
    .gt("priority_weight", 7)
    .in("source_node_id", [...mentionSet]);

  const { data: inbound, error: e2 } = await supabase
    .from("node_links")
    .select(
      "id,source_node_id,target_node_id,relationship_context,priority_weight"
    )
    .gt("priority_weight", 7)
    .in("target_node_id", [...mentionSet]);

  if (e1) console.error("[chat] node_links outbound:", e1.message);
  if (e2) console.error("[chat] node_links inbound:", e2.message);

  type LinkRow = {
    id?: string;
    source_node_id: string;
    target_node_id: string;
    relationship_context: string | null;
    priority_weight: number;
  };

  const merged: LinkRow[] = [...(outbound ?? []), ...(inbound ?? [])];
  const linkSeen = new Set<string>();
  const linksRaw: LinkRow[] = [];

  for (const row of merged) {
    const key = row.id
      ? lc(row.id)
      : `${lc(row.source_node_id)}|${lc(row.target_node_id)}|${row.priority_weight}`;
    if (linkSeen.has(key)) continue;
    linkSeen.add(key);
    linksRaw.push(row);
  }

  /** Neighbour endpoints (excluding ids that themselves are mentioned). */
  const neighborLc = new Set<string>();
  for (const row of linksRaw) {
    const s = lc(row.source_node_id);
    const t = lc(row.target_node_id);
    if (mentionSet.has(s) && !mentionSet.has(t)) neighborLc.add(t);
    if (mentionSet.has(t) && !mentionSet.has(s)) neighborLc.add(s);
  }

  const neighborRowsByLc = new Map(
    (await fetchNodesByIds(supabase, [...neighborLc])).map((n) => [
      lc(n.id),
      n,
    ])
  );

  const sections: string[] = [];

  sections.push("## Mentioned workspace nodes (@ references)");
  if (primaryNodes.length === 0) {
    sections.push(
      "_No matching `nodes` rows for this session (IDs not found or RLS returned nothing)._"
    );
  } else {
    for (const id of [...mentionSet]) {
      const n = primaryById.get(id);
      if (!n) continue;
      sections.push(
        [
          `### ${n.title}`,
          `- id: \`${n.id}\``,
          `- level: ${n.node_level} · status: ${n.status}`,
          n.system_prompt
            ? `- system_prompt:\\n${n.system_prompt}`
            : "- system_prompt: _(empty)_",
          n.core_summary
            ? `- core_summary:\\n${n.core_summary}`
            : "- core_summary: _(empty)_",
        ].join("\n")
      );
    }
  }

  sections.push("");
  sections.push(
    "## High‑priority graph context (`node_links.priority_weight > 7`, neighbour `core_summary`)"
  );

  if (neighborLc.size === 0 || linksRaw.length === 0) {
    sections.push("_No outbound/inbound neighbour summaries beyond mentioned rows._");
  } else {
    const emitted = new Set<string>();
    for (const row of linksRaw) {
      const s = lc(row.source_node_id);
      const t = lc(row.target_node_id);

      const sides: Array<{ anchor: string; other: string }> = [];

      if (mentionSet.has(s) && neighborLc.has(t)) {
        sides.push({ anchor: s, other: t });
      }
      if (mentionSet.has(t) && neighborLc.has(s)) {
        sides.push({ anchor: t, other: s });
      }

      for (const { anchor, other } of sides) {
        const key = `${anchor}→${other}:${row.priority_weight}:${row.relationship_context ?? ""}`;
        if (emitted.has(key)) continue;
        emitted.add(key);

        const anchorTitle = primaryById.get(anchor)?.title ?? anchor;
        const otherNode = neighborRowsByLc.get(other);
        sections.push(
          [
            `- **Edge** “${anchorTitle}” → “${otherNode?.title ?? other}” (**priority_weight=${row.priority_weight}**)`,
            row.relationship_context
              ? `  _relationship_context:_ ${row.relationship_context}`
              : `  _relationship_context:_ _(none)_`,
            otherNode?.core_summary
              ? `  **Neighbour core_summary:** ${otherNode.core_summary}`
              : `  **Neighbour core_summary:** _(empty)_`,
          ].join("\n")
        );
      }
    }
  }

  return sections.join("\n");
}
