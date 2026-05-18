/** Shape used in the sidebar + panes (matches `nodes` row subset). */

export type NodeLevel = "account" | "domain" | "project" | "task";
export type NodeStatus = "onboarding" | "active";

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
