import type { NodeLevel, NodeRowSnapshot, NodeStatus } from "@/types/nodes";

/** Coerces JSONB / API payload into onboarding question strings or null. */
export function coerceOnboardingQuestions(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out = raw.filter(
    (x): x is string =>
      typeof x === "string" && x.trim().length > 0
  );
  return out.length > 0 ? out : null;
}

/** Coerces DB JSON array into onboarding answer strings (indices preserved). */
export function coerceOnboardingAnswers(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw.map((x) => (typeof x === "string" ? x : ""));
}

/** Pad / trim answers so they line up with the current question list. */
export function alignOnboardingAnswersWithQuestions(
  questions: string[],
  answers: string[] | null,
  maxChars = 16000
): string[] {
  const a = answers ?? [];
  return questions.map((_, i) =>
    typeof a[i] === "string" ? a[i].slice(0, maxChars) : ""
  );
}

export function snapshotFromSupabaseRow(row: {
  id: string;
  title: string | null;
  node_level: string;
  parent_id: string | null;
  core_summary: string | null;
  system_prompt: string | null;
  status: string;
  onboarding_questions?: unknown;
  onboarding_answers?: unknown;
  archived_at?: string | null;
}): NodeRowSnapshot {
  return {
    id: row.id,
    title: row.title ?? "Untitled",
    node_level: row.node_level as NodeLevel,
    parent_id: row.parent_id,
    core_summary: row.core_summary,
    system_prompt: row.system_prompt,
    status: row.status as NodeStatus,
    onboarding_questions: coerceOnboardingQuestions(row.onboarding_questions),
    onboarding_answers: coerceOnboardingAnswers(row.onboarding_answers),
    archived_at: row.archived_at ?? null,
  };
}
