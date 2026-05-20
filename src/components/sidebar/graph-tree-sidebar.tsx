"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ChatConfirmModal } from "@/components/chat/chat-confirm-modal";
import { NewNodeDialog } from "@/components/sidebar/new-node-dialog";
import { NodeRecycleBinPanel } from "@/components/sidebar/node-recycle-bin-panel";
import { Button } from "@/components/ui/button";
import { collectSubtreeIds, type ParentEdgeRow } from "@/lib/nodes/subtree-graph";
import { snapshotFromSupabaseRow } from "@/lib/nodes/snapshot-from-row";
import { buildTreeFromRows } from "@/lib/nodes/tree";
import { createClient } from "@/lib/supabase/client";
import { useNodeStore } from "@/lib/store/use-node-store";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/types/nodes";

const COLLAPSED_NODES_STORAGE_KEY = "sb.graph.collapsedNodes";

function NodeRow({
  node,
  depth,
  collapsedById,
  onToggleCollapse,
  onNodeSelected,
}: {
  node: TreeNode;
  depth: number;
  collapsedById: Record<string, boolean>;
  onToggleCollapse: (nodeId: string) => void;
  onNodeSelected?: () => void;
}) {
  const selectedNodeId = useNodeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useNodeStore((s) => s.setSelectedNodeId);
  const hasChildren = node.children.length > 0;
  const collapsed = hasChildren && Boolean(collapsedById[node.id]);
  const isSelected = selectedNodeId === node.id;

  return (
    <li className="select-none">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            setSelectedNodeId(node.id);
            onNodeSelected?.();
          }}
          className={cn(
            "flex w-full items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            "hover:bg-muted/80 hover:text-foreground",
            "focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
            isSelected &&
              "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {hasChildren ? (
            <span
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse(node.id);
              }}
              className="mr-1 inline-flex rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-hidden
            >
              {collapsed ? (
                <ChevronRight className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
            </span>
          ) : (
            <span className="mr-2 inline-block size-3.5 shrink-0" aria-hidden />
          )}
          <span
            className={cn(
              "mr-2 mt-1.5 inline-block size-2 shrink-0 rounded-full",
              hasChildren ? "bg-primary/60" : "bg-muted-foreground/40"
            )}
            aria-hidden
          />
          <span className="truncate">{node.title}</span>
          <span className="ml-2 truncate text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {node.node_level}
          </span>
        </button>
        {hasChildren && !collapsed ? (
          <TreeList
            nodes={node.children}
            depth={depth + 1}
            collapsedById={collapsedById}
            onToggleCollapse={onToggleCollapse}
            onNodeSelected={onNodeSelected}
          />
        ) : null}
      </div>
    </li>
  );
}

function TreeList({
  nodes,
  depth,
  collapsedById,
  onToggleCollapse,
  onNodeSelected,
}: {
  nodes: TreeNode[];
  depth: number;
  collapsedById: Record<string, boolean>;
  onToggleCollapse: (nodeId: string) => void;
  onNodeSelected?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          depth={depth}
          collapsedById={collapsedById}
          onToggleCollapse={onToggleCollapse}
          onNodeSelected={onNodeSelected}
        />
      ))}
    </ul>
  );
}

export function DashboardSidebar({
  className,
  onNodeSelected,
}: {
  className?: string;
  onNodeSelected?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});

  const nodesById = useNodeStore((s) => s.nodesById);
  const syncNodesFromRows = useNodeStore((s) => s.syncNodesFromRows);
  const resetWorkspace = useNodeStore((s) => s.resetWorkspace);
  const selectedNodeId = useNodeStore((s) => s.selectedNodeId);
  const suggestedParentId = selectedNodeId;

  const displayRoots = useMemo(
    () => buildTreeFromRows(Object.values(nodesById)),
    [nodesById]
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_NODES_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsedById(parsed as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleNodeCollapsed = useCallback((nodeId: string) => {
    setCollapsedById((prev) => {
      const next = {
        ...prev,
        [nodeId]: !prev[nodeId],
      };
      try {
        window.localStorage.setItem(
          COLLAPSED_NODES_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const loadNodes = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        resetWorkspace();
        return;
      }

      const { data, error } = await supabase
        .from("nodes")
        .select(
          "id,title,node_level,parent_id,core_summary,system_prompt,status,onboarding_questions,onboarding_answers,archived_at"
        )
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const snapshots = (data ?? []).map((r) => snapshotFromSupabaseRow(r));
      syncNodesFromRows(snapshots);
    } catch (e) {
      resetWorkspace();
      setLoadErr(
        e instanceof Error ? e.message : "Could not load graph from Supabase"
      );
    } finally {
      setLoading(false);
    }
  }, [resetWorkspace, syncNodesFromRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNodes();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadNodes();
    });

    return () => subscription.unsubscribe();
  }, [loadNodes]);

  const canPromptArchiveDelete = Boolean(selectedNodeId);

  async function archiveSubtreeForSelection() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !selectedNodeId) return;

    const { data: flat, error } = await supabase
      .from("nodes")
      .select("id,parent_id")
      .eq("user_id", user.id)
      .is("archived_at", null);

    if (error) throw error;

    const subtree = collectSubtreeIds(
      selectedNodeId,
      (flat ?? []) as ParentEdgeRow[]
    );

    const { error: upErr } = await supabase
      .from("nodes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", [...subtree]);

    if (upErr) throw upErr;
  }

  return (
    <aside
      className={cn(
        "flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-sidebar-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Graph
          </p>
          <h2 className="text-lg font-semibold leading-tight">Second Brain</h2>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={() => setDialogOpen(true)}
        >
          New node
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-sidebar-border px-4 py-2.5">
        <NodeRecycleBinPanel onGraphChanged={loadNodes} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canPromptArchiveDelete}
          className="shrink-0"
          onClick={() => setConfirmArchiveOpen(true)}
        >
          Delete node…
        </Button>
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loading ? (
          <p className="px-1 text-sm text-muted-foreground">Loading nodes…</p>
        ) : loadErr ? (
          <p className="px-1 text-sm text-destructive">{loadErr}</p>
        ) : displayRoots.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            No nodes yet — create one to start your graph.
          </p>
        ) : (
          <TreeList
            nodes={displayRoots}
            depth={0}
            collapsedById={collapsedById}
            onToggleCollapse={toggleNodeCollapsed}
            onNodeSelected={onNodeSelected}
          />
        )}
      </nav>
      <footer className="border-t border-sidebar-border px-3 py-3 text-xs text-muted-foreground">
        Live graph from Supabase (<code className="text-foreground">nodes</code>) with RLS.
      </footer>

      <ChatConfirmModal
        open={confirmArchiveOpen}
        onClose={() => setConfirmArchiveOpen(false)}
        title="Move this node to the recycle bin?"
        description={
          selectedNodeId
            ? `“${nodesById[selectedNodeId]?.title ?? "Node"}” and all of its descendants will be hidden from the graph. You can restore or permanently delete them from Nodes bin.`
            : ""
        }
        confirmLabel="Move to Nodes bin"
        destructive
        confirmDisabled={!canPromptArchiveDelete}
        onConfirm={async () => {
          await archiveSubtreeForSelection();
          await loadNodes();
        }}
      />

      <NewNodeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={loadNodes}
        suggestedParentId={suggestedParentId}
      />
    </aside>
  );
}
