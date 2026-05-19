export type IntegrationCandidate = {
  id: string;
  name: string;
  category: string;
  website: string;
  summary: string;
  keywords: string[];
  auth: "api_key" | "oauth" | "unknown";
};

export const integrationRegistry: IntegrationCandidate[] = [
  {
    id: "hevy",
    name: "Hevy",
    category: "fitness",
    website: "https://www.hevyapp.com",
    summary: "Workout tracking and lift history.",
    keywords: ["fitness", "gym", "workout", "lifting", "weight room", "hevy"],
    auth: "unknown",
  },
  {
    id: "strava",
    name: "Strava",
    category: "fitness",
    website: "https://www.strava.com",
    summary: "Running and cycling activity data.",
    keywords: ["fitness", "running", "cycling", "training", "strava"],
    auth: "oauth",
  },
  {
    id: "notion",
    name: "Notion",
    category: "productivity",
    website: "https://www.notion.so",
    summary: "Docs, project notes, and task knowledge bases.",
    keywords: ["notes", "knowledge", "docs", "tasks", "notion", "productivity"],
    auth: "oauth",
  },
  {
    id: "github",
    name: "GitHub",
    category: "engineering",
    website: "https://github.com",
    summary: "Repositories, issues, PRs, and engineering metadata.",
    keywords: ["code", "repo", "issues", "pull request", "engineering", "github"],
    auth: "oauth",
  },
];

export function discoverIntegrations(
  contextText: string,
  limit = 5
): IntegrationCandidate[] {
  const lc = contextText.toLowerCase();
  const scored = integrationRegistry
    .map((candidate) => {
      const score = candidate.keywords.reduce((acc, keyword) => {
        if (lc.includes(keyword.toLowerCase())) return acc + 1;
        return acc;
      }, 0);
      return { candidate, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.candidate);

  return scored;
}

export function lookupIntegrationByName(
  query: string
): IntegrationCandidate | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  const exact = integrationRegistry.find(
    (candidate) =>
      candidate.name.toLowerCase() === trimmed ||
      candidate.id.toLowerCase() === trimmed
  );
  if (exact) return exact;

  const byKeyword = integrationRegistry.find((candidate) =>
    candidate.keywords.some((keyword) =>
      keyword.toLowerCase().includes(trimmed) || trimmed.includes(keyword.toLowerCase())
    )
  );
  if (byKeyword) return byKeyword;

  const byPartialName = integrationRegistry.find((candidate) =>
    candidate.name.toLowerCase().includes(trimmed)
  );
  return byPartialName ?? null;
}

