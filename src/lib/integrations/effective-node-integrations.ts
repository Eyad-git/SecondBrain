type NodeRow = {
  id: string;
  parent_id: string | null;
  title: string | null;
};

type IntegrationRow = {
  id: string;
  node_id: string;
  name: string | null;
  base_url: string | null;
  auth_type: "api_key" | "oauth" | "unknown" | string | null;
  notes: string | null;
  secret_ciphertext: string | null;
  secret_hint: string | null;
  created_at: string | null;
};

export type EffectiveNodeIntegration = {
  id: string;
  name: string;
  baseUrl: string;
  auth: "api_key" | "oauth" | "unknown";
  notes: string;
  hasSecret: boolean;
  secretHint: string | null;
  sourceNodeId: string;
  sourceNodeTitle: string | null;
  inherited: boolean;
  createdAt: string;
};

const MAX_ANCESTRY_DEPTH = 32;

function normalizeAuth(value: IntegrationRow["auth_type"]): "api_key" | "oauth" | "unknown" {
  return value === "api_key" || value === "oauth" || value === "unknown"
    ? value
    : "unknown";
}

function toEffectiveIntegration(
  row: IntegrationRow,
  targetNodeId: string,
  sourceNodeTitle: string | null
): EffectiveNodeIntegration {
  return {
    id: String(row.id),
    name: String(row.name ?? "Integration"),
    baseUrl: typeof row.base_url === "string" ? row.base_url : "",
    auth: normalizeAuth(row.auth_type),
    notes: typeof row.notes === "string" ? row.notes : "",
    hasSecret: Boolean(row.secret_ciphertext),
    secretHint: typeof row.secret_hint === "string" ? row.secret_hint : null,
    sourceNodeId: String(row.node_id),
    sourceNodeTitle,
    inherited: String(row.node_id) !== targetNodeId,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function loadNodeLookup(
  supabase: any,
  userId: string,
  nodeIds: string[]
) {
  const byId = new Map<string, NodeRow>();
  let frontier = [...new Set(nodeIds.filter(Boolean))];
  let safety = 0;

  while (frontier.length > 0 && safety < MAX_ANCESTRY_DEPTH) {
    const { data, error } = await supabase
      .from("nodes")
      .select("id,parent_id,title")
      .eq("user_id", userId)
      .in("id", frontier);
    if (error) throw new Error(error.message);
    const rows: NodeRow[] = (data ?? []) as NodeRow[];
    frontier = [];
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, row);
      if (row.parent_id && !byId.has(row.parent_id)) {
        frontier.push(row.parent_id);
      }
    }
    frontier = [...new Set(frontier)];
    safety += 1;
  }

  return byId;
}

function ancestryForTarget(nodeById: Map<string, NodeRow>, targetNodeId: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = targetNodeId;
  let safety = 0;

  while (currentId && safety < MAX_ANCESTRY_DEPTH && !visited.has(currentId)) {
    visited.add(currentId);
    chain.push(currentId);
    const node = nodeById.get(currentId);
    if (!node?.parent_id) break;
    currentId = node.parent_id;
    safety += 1;
  }

  return chain;
}

export async function listEffectiveIntegrationsForNodes(
  supabase: any,
  userId: string,
  targetNodeIds: string[]
): Promise<Record<string, EffectiveNodeIntegration[]>> {
  const uniqueTargetIds = [...new Set(targetNodeIds.filter(Boolean))];
  if (uniqueTargetIds.length === 0) return {};

  const nodeById = await loadNodeLookup(supabase, userId, uniqueTargetIds);
  const chainByTarget = new Map<string, string[]>();
  const allSourceIds = new Set<string>();

  for (const targetId of uniqueTargetIds) {
    const chain = ancestryForTarget(nodeById, targetId);
    chainByTarget.set(targetId, chain);
    for (const sourceId of chain) allSourceIds.add(sourceId);
  }

  if (allSourceIds.size === 0) {
    return Object.fromEntries(uniqueTargetIds.map((id) => [id, []]));
  }

  const { data, error } = await supabase
    .from("node_api_integrations")
    .select(
      "id,node_id,name,base_url,auth_type,notes,secret_ciphertext,secret_hint,created_at"
    )
    .eq("user_id", userId)
    .in("node_id", [...allSourceIds])
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows: IntegrationRow[] = (data ?? []) as IntegrationRow[];
  const result: Record<string, EffectiveNodeIntegration[]> = {};
  for (const targetId of uniqueTargetIds) {
    const chain = chainByTarget.get(targetId) ?? [];
    const depthBySource = new Map(chain.map((id, idx) => [id, idx]));
    const integrations = rows
      .filter((row: IntegrationRow) => depthBySource.has(String(row.node_id)))
      .sort((a: IntegrationRow, b: IntegrationRow) => {
        const da = depthBySource.get(String(a.node_id)) ?? Number.MAX_SAFE_INTEGER;
        const db = depthBySource.get(String(b.node_id)) ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
      })
      .map((row: IntegrationRow) =>
        toEffectiveIntegration(
          row,
          targetId,
          nodeById.get(String(row.node_id))?.title ?? null
        )
      );
    result[targetId] = integrations;
  }

  return result;
}
