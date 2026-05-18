"use client";

import { Archive, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ChatConfirmModal } from "@/components/chat/chat-confirm-modal";
import { ChatModalShell } from "@/components/chat/chat-modal-shell";
import { snapshotFromSupabaseRow } from "@/lib/nodes/snapshot-from-row";
import {
  collectSubtreeIds,
  subtreeDeleteOrder,
  type ParentEdgeRow,
} from "@/lib/nodes/subtree-graph";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { NodeRowSnapshot } from "@/types/nodes";

function formatArchived(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

type Props = {
  /** Call after mutations so counts + graph stay in sync. */
  onGraphChanged: () => void | Promise<void>;
};

async function fetchArchivedSnapshots(): Promise<NodeRowSnapshot[]> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from("nodes")
    .select(
      "id,title,node_level,parent_id,core_summary,system_prompt,status,onboarding_questions,onboarding_answers,archived_at"
    )
    .eq("user_id", userData.user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => snapshotFromSupabaseRow(r));
}

async function fetchArchivedEdges(userId: string): Promise<ParentEdgeRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("nodes")
    .select("id,parent_id")
    .eq("user_id", userId)
    .not("archived_at", "is", null);

  if (error) throw new Error(error.message);
  return (data ?? []) as ParentEdgeRow[];
}

export function NodeRecycleBinPanel({ onGraphChanged }: Props) {
  const [binOpen, setBinOpen] = useState(false);
  const stashBinRef = useRef(false);
  const titleId = useId();

  const [snapshots, setSnapshots] = useState<NodeRowSnapshot[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const refreshMeta = useCallback(async () => {
    try {
      if (binOpen) setLoadingList(true);
      const snaps = await fetchArchivedSnapshots();
      setBadgeCount(snaps.length);
      setLoadErr(null);
      if (binOpen) setSnapshots(snaps);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not refresh recycle bin.";
      setLoadErr(msg);
      if (binOpen) setSnapshots([]);
    } finally {
      if (binOpen) setLoadingList(false);
    }
  }, [binOpen]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta, onGraphChanged]);

  const edges: ParentEdgeRow[] = snapshots.map((s) => ({
    id: s.id,
    parent_id: s.parent_id,
  }));

  const subtreeSize = useCallback(
    (rootId: string) => collectSubtreeIds(rootId, edges).size,
    [edges]
  );

  async function mutateGraph() {
    await Promise.resolve(onGraphChanged());
    await refreshMeta();
  }

  function suspendBinForNestedModal() {
    stashBinRef.current = binOpen;
    if (binOpen) setBinOpen(false);
  }

  function resumeBinAfterNestedModal() {
    if (stashBinRef.current) {
      setBinOpen(true);
      stashBinRef.current = false;
    }
  }

  async function restoreSubtree(entry: NodeRowSnapshot) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const archived = await fetchArchivedEdges(user.id);
    const subtree = collectSubtreeIds(entry.id, archived);
    const idList = [...subtree];

    const { error: upErr } = await supabase
      .from("nodes")
      .update({ archived_at: null })
      .in("id", idList);
    if (upErr) throw new Error(upErr.message);

    const { data: reopened } = await supabase
      .from("nodes")
      .select("id,parent_id")
      .in("id", idList);

    for (const r of reopened ?? []) {
      const p = r.parent_id as string | null;
      if (!p || subtree.has(p)) continue;
      const { data: parent } = await supabase
        .from("nodes")
        .select("archived_at")
        .eq("id", p)
        .maybeSingle();
      if ((parent as { archived_at?: string | null } | null)?.archived_at) {
        await supabase.from("nodes").update({ parent_id: null }).eq("id", r.id);
      }
    }

    await mutateGraph();
  }

  async function eraseSubtreePermanently(entry: NodeRowSnapshot) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const archived = await fetchArchivedEdges(user.id);
    const subtree = collectSubtreeIds(entry.id, archived);
    const subRows = archived.filter((row) => subtree.has(row.id));
    const order = subtreeDeleteOrder(subtree, subRows);

    for (const id of order) {
      const { error: delErr } = await supabase.from("nodes").delete().eq("id", id);
      if (delErr) throw new Error(delErr.message);
    }

    await mutateGraph();
  }

  async function eraseAllArchivedNodes() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const archived = await fetchArchivedEdges(user.id);
    if (archived.length === 0) return;

    const ids = new Set(archived.map((row) => row.id));
    const order = subtreeDeleteOrder(ids, archived);

    for (const id of order) {
      const { error: delErr } = await supabase.from("nodes").delete().eq("id", id);
      if (delErr) throw new Error(delErr.message);
    }

    await mutateGraph();
  }

  const [purgeOpen, setPurgeOpen] = useState(false);
  const [eraseTarget, setEraseTarget] = useState<NodeRowSnapshot | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<NodeRowSnapshot | null>(null);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 gap-1 text-xs"
        onClick={() => setBinOpen(true)}
      >
        <Archive className="size-3.5 shrink-0" aria-hidden />
        Nodes bin
        <span className="text-muted-foreground tabular-nums">
          ({badgeCount})
        </span>
      </Button>

      <ChatModalShell open={binOpen} onClose={() => setBinOpen(false)} labelledBy={titleId}>
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h3 id={titleId} className="text-base font-semibold">
              Nodes recycle bin
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Archived nodes are hidden from the graph. Restore brings back this node and
              archived descendants together. Erase runs real DELETE queries. Escape or click
              the backdrop to close when no nested confirm is open.
            </p>
          </div>

          <div className="max-h-[min(420px,50vh)] min-h-[8rem] flex-1 overflow-y-auto px-3 py-3">
            {loadingList ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Loading archived nodes…
              </p>
            ) : loadErr ? (
              <p className="py-10 text-center text-sm text-destructive">{loadErr}</p>
            ) : snapshots.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No archived nodes.
              </p>
            ) : (
              <ul className="space-y-3">
                {snapshots.map((s) => {
                  const when =
                    typeof s.archived_at === "string"
                      ? formatArchived(s.archived_at)
                      : "";
                  const n = subtreeSize(s.id);
                  return (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border bg-muted/25 px-3 py-2"
                    >
                      <p className="truncate font-medium text-foreground">{s.title}</p>
                      <p className="text-[0.72rem] text-muted-foreground">
                        {when} · {s.node_level} · subtree {n} node{n === 1 ? "" : "s"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            suspendBinForNestedModal();
                            setRestoreTarget(s);
                          }}
                        >
                          Restore subtree
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => {
                            suspendBinForNestedModal();
                            setEraseTarget(s);
                          }}
                        >
                          <Trash2 className="size-3" aria-hidden />
                          Erase forever
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 justify-between gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => setBinOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={badgeCount === 0}
              onClick={() => {
                suspendBinForNestedModal();
                setPurgeOpen(true);
              }}
            >
              Empty recycle bin…
            </Button>
          </div>
        </div>
      </ChatModalShell>

      <ChatConfirmModal
        open={purgeOpen}
        onClose={() => {
          setPurgeOpen(false);
          resumeBinAfterNestedModal();
        }}
        title="Permanently delete every archived node?"
        description="Deletes all rows in Supabase whose archived_at is set. This cannot be undone. Dependent FK rows may be affected outside this subtree."
        confirmLabel="Erase all archived"
        destructive
        onConfirm={eraseAllArchivedNodes}
      />

      <ChatConfirmModal
        open={eraseTarget !== null}
        onClose={() => {
          setEraseTarget(null);
          resumeBinAfterNestedModal();
        }}
        title="Permanently erase this archived subtree?"
        description={`Removes “${eraseTarget?.title ?? ""}” and every descendant that is still archived with it.`}
        confirmLabel="Erase forever"
        destructive
        confirmDisabled={!eraseTarget}
        onConfirm={async () => {
          if (eraseTarget) await eraseSubtreePermanently(eraseTarget);
        }}
      />

      <ChatConfirmModal
        open={restoreTarget !== null}
        onClose={() => {
          setRestoreTarget(null);
          resumeBinAfterNestedModal();
        }}
        title="Restore this archived subtree?"
        description={`Puts “${restoreTarget?.title ?? ""}” and its archived descendants back on the graph. If a restored node’s parent is still archived, we attach it at the graph root.`}
        confirmLabel="Restore"
        confirmDisabled={!restoreTarget}
        onConfirm={async () => {
          if (!restoreTarget) return;
          stashBinRef.current = false;
          await restoreSubtree(restoreTarget);
          setRestoreTarget(null);
          setBinOpen(false);
        }}
      />
    </>
  );
}
