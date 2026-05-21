/** Shape used in the sidebar + panes (matches `nodes` row subset). */

export type NodeLevel = "account" | "domain" | "project" | "task";
export type NodeStatus = "onboarding" | "active";

export type NodeApiIntegration = {
  id: string;
  name: string;
  baseUrl: string;
  auth: "api_key" | "oauth" | "unknown";
  notes: string;
  hasSecret?: boolean;
  secretHint?: string | null;
  sourceNodeId?: string;
  sourceNodeTitle?: string | null;
  inherited?: boolean;
};

export type NodeScrapedSite = {
  id: string;
  nodeId: string;
  url: string;
  fetchedUrl: string;
  title: string | null;
  contentExcerpt: string;
  contentType: string | null;
  bytesRead: number;
  createdAt: string;
};

export type NodeGooglePhotosItem = {
  id: string;
  nodeId: string;
  itemType: "album" | "photo";
  googleItemId: string;
  title: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  productUrl: string | null;
  mimeType: string | null;
  createdTime: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type NodeRowSnapshot = {
  id: string;
  title: string;
  node_level: NodeLevel;
  parent_id: string | null;
  core_summary: string | null;
  system_prompt: string | null;
  /** From Architect (`nodes.onboarding_questions` JSON array). */
  onboarding_questions: string[] | null;
  /** User-written answers aligned by index with onboarding_questions (`nodes.onboarding_answers`). */
  onboarding_answers: string[] | null;
  status: NodeStatus;
  /** When set, node is in the recycle bin (not shown in the graph). */
  archived_at: string | null;
};

export type TreeNode = NodeRowSnapshot & {
  children: TreeNode[];
};
