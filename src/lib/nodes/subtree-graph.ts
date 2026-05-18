/** Flat row for parent/child edges (active or archived subgraphs). */

export type ParentEdgeRow = { id: string; parent_id: string | null };

/** DFS stack: `rootId` plus every descendant reachable in `rows`. */
export function collectSubtreeIds(
  rootId: string,
  rows: ParentEdgeRow[]
): Set<string> {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const list = children.get(r.parent_id) ?? [];
    list.push(r.id);
    children.set(r.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    const next = children.get(id);
    if (next) {
      for (const c of next) stack.push(c);
    }
  }
  return out;
}

const byIdFromRows = (rows: ParentEdgeRow[]) =>
  new Map(rows.map((r) => [r.id, r]));

/**
 * Delete order for a set of nodes: remove a leaf of the induced subgraph first
 * (`parent_id` FK is `ON DELETE SET NULL`).
 */
export function subtreeDeleteOrder(
  ids: Set<string>,
  rows: ParentEdgeRow[]
): string[] {
  const byId = byIdFromRows(rows);
  const remaining = new Set(ids);
  const order: string[] = [];
  while (remaining.size > 0) {
    const leaf = [...remaining].find(
      (id) => ![...remaining].some((c) => byId.get(c)?.parent_id === id)
    );
    if (!leaf) {
      throw new Error(
        "Could not determine safe delete order — graph may contain a cycle."
      );
    }
    order.push(leaf);
    remaining.delete(leaf);
  }
  return order;
}
