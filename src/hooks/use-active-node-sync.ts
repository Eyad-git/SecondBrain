"use client";

import { useEffect, useState } from "react";

import { snapshotFromSupabaseRow } from "@/lib/nodes/snapshot-from-row";
import { createClient } from "@/lib/supabase/client";
import { useNodeStore } from "@/lib/store/use-node-store";

export type LinkedInfluence = {
  linkId: string;
  peerId: string;
  peerTitle: string;
  /** Row is outbound from selected node (`source_node_id` = selection). */
  direction: "outbound" | "inbound";
  priority_weight: number;
  relationship_context: string | null;
};

export type ActiveNodeSyncState = {
  loading: boolean;
  error: string | null;
  linksError: string | null;
  influences: LinkedInfluence[];
};

/**
 * Keeps Supabase authoritative fields for `selectedNodeId` in the workspace store,
 * plus loads neighbourhood `node_links` for the Context pane.
 */
export function useActiveNodeSync(): ActiveNodeSyncState {
  const nodeId = useNodeStore((s) => s.selectedNodeId);
  const mergeNodeSnapshot = useNodeStore((s) => s.mergeNodeSnapshot);
  const setSelectedNodeId = useNodeStore((s) => s.setSelectedNodeId);

  const [state, setState] = useState<ActiveNodeSyncState>({
    loading: false,
    error: null,
    linksError: null,
    influences: [],
  });

  useEffect(() => {
    if (!nodeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ loading: false, error: null, linksError: null, influences: [] });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({
        loading: true,
        error: null,
        linksError: null,
        influences: [],
      });

      const supabase = createClient();

      const { data: row, error: rowErr } = await supabase
        .from("nodes")
        .select(
          "id,title,node_level,parent_id,core_summary,system_prompt,status,onboarding_questions,onboarding_answers,archived_at"
        )
        .eq("id", nodeId)
        .maybeSingle();

      if (cancelled) return;

      if (rowErr) {
        setState({
          loading: false,
          error: rowErr.message,
          linksError: null,
          influences: [],
        });
        return;
      }
      if (!row) {
        setState({
          loading: false,
          error: "Node not found or you do not have access.",
          linksError: null,
          influences: [],
        });
        return;
      }

      const raw = row as { archived_at?: string | null };
      if (raw.archived_at) {
        setSelectedNodeId(null);
        setState({
          loading: false,
          error:
            "That node is in the recycle bin. Restore it from the sidebar recycle bin to open it.",
          linksError: null,
          influences: [],
        });
        return;
      }

      const snapshot = snapshotFromSupabaseRow(row);
      mergeNodeSnapshot(snapshot);

      const [
        { data: outbound, error: oErr },
        { data: inbound, error: iErr },
      ] = await Promise.all([
        supabase
          .from("node_links")
          .select(
            "id,source_node_id,target_node_id,relationship_context,priority_weight"
          )
          .eq("source_node_id", nodeId),
        supabase
          .from("node_links")
          .select(
            "id,source_node_id,target_node_id,relationship_context,priority_weight"
          )
          .eq("target_node_id", nodeId),
      ]);

      if (cancelled) return;

      const combinedLinkError = oErr?.message ?? iErr?.message ?? null;
      if (combinedLinkError) {
        console.error("[active-node-sync] links:", combinedLinkError);
      }

      const peerIds = new Set<string>();
      for (const r of outbound ?? []) {
        peerIds.add(String((r as { target_node_id: string }).target_node_id));
      }
      for (const r of inbound ?? []) {
        peerIds.add(String((r as { source_node_id: string }).source_node_id));
      }

      let titles = new Map<string, string>();
      let titleLoadError: string | null = null;
      if (peerIds.size > 0) {
        const { data: nodes, error: titleErr } = await supabase
          .from("nodes")
          .select("id,title")
          .in("id", [...peerIds])
          .is("archived_at", null);
        titleLoadError = titleErr?.message ?? null;
        titles = new Map(
          (nodes ?? []).map((n) => [String(n.id), n.title ?? "Untitled"])
        );
      }

      if (cancelled) return;

      const influences: LinkedInfluence[] = [];

      for (const r of outbound ?? []) {
        const row = r as {
          id: string;
          target_node_id: string;
          priority_weight: number;
          relationship_context: string | null;
        };
        influences.push({
          linkId: row.id,
          peerId: String(row.target_node_id),
          peerTitle:
            titles.get(String(row.target_node_id)) ??
            "Unavailable or archived node",
          direction: "outbound",
          priority_weight: Number(row.priority_weight) || 0,
          relationship_context: row.relationship_context,
        });
      }

      for (const r of inbound ?? []) {
        const row = r as {
          id: string;
          source_node_id: string;
          priority_weight: number;
          relationship_context: string | null;
        };
        influences.push({
          linkId: row.id,
          peerId: String(row.source_node_id),
          peerTitle:
            titles.get(String(row.source_node_id)) ??
            "Unavailable or archived node",
          direction: "inbound",
          priority_weight: Number(row.priority_weight) || 0,
          relationship_context: row.relationship_context,
        });
      }

      influences.sort((a, b) => b.priority_weight - a.priority_weight);

      const linksError =
        combinedLinkError || titleLoadError
          ? "Linked nodes could not be fully loaded right now."
          : null;
      setState({ loading: false, error: null, linksError, influences });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [nodeId, mergeNodeSnapshot, setSelectedNodeId]);

  return state;
}
