import type { NodeRowSnapshot, TreeNode } from "@/types/nodes";

function sortByTitle(a: TreeNode, b: TreeNode) {
  return a.title.localeCompare(b.title);
}

/**
 * Build a forest from flat rows (orphans or missing parents become roots).
 */
export function buildTreeFromRows(rows: NodeRowSnapshot[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const r of rows) {
    byId.set(r.id, { ...r, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    const parentId = r.parent_id;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const walk = (nodes: TreeNode[]) => {
    nodes.sort(sortByTitle);
    for (const n of nodes) walk(n.children);
  };
  walk(roots);
  return roots;
}

export function pickDefaultSelectedId(rows: NodeRowSnapshot[]): string | null {
  if (rows.length === 0) return null;
  const idSet = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => !r.parent_id || !idSet.has(r.parent_id));
  const pick = (candidates: NodeRowSnapshot[]) =>
    [...candidates].sort((a, b) => a.title.localeCompare(b.title))[0]?.id ??
    null;
  return pick(roots.length ? roots : rows);
}
