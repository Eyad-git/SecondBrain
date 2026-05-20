export type ChatCommand =
  | { type: "none" }
  | { type: "api-start"; integrationName: string }
  | { type: "scrape-start"; query?: string };

/**
 * Parse deterministic slash commands handled by Ask chat client.
 */
export function parseChatCommand(raw: string): ChatCommand {
  const text = raw.trim();
  if (!text.startsWith("/")) return { type: "none" };

  if (text.startsWith("/api")) {
    const rest = text.slice(4).trim();
    if (!rest) return { type: "none" };
    return { type: "api-start", integrationName: rest };
  }

  if (text.startsWith("/scrape")) {
    const rest = text.slice(7).trim();
    if (!rest) return { type: "scrape-start" };
    return { type: "scrape-start", query: rest };
  }

  return { type: "none" };
}
