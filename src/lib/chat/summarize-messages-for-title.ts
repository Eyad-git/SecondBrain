import type { UIMessage } from "ai";

import { stringifyUserUiMessages } from "@/lib/chat/extract-user-text-from-ui";

/** Compact transcript for title generation (caps length). */
export function summarizeMessagesForTitle(
  messages: UIMessage[],
  maxChars = 2400
): string {
  const lines: string[] = [];

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const label = m.role === "user" ? "User" : "Assistant";
    const parts: string[] = [];
    for (const part of m.parts ?? []) {
      if (
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        const t = (part as { text: string }).text.trim();
        if (t) parts.push(t);
      }
    }
    if (parts.length === 0) continue;
    lines.push(`${label}: ${parts.join("\n")}`);
    if (lines.join("\n\n").length > maxChars) break;
  }

  let body = lines.join("\n\n");
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}…`;
  }

  const userOnly = stringifyUserUiMessages(messages).trim();
  if (!body && userOnly) {
    return userOnly.length > maxChars
      ? `${userOnly.slice(0, maxChars)}…`
      : userOnly;
  }

  return body;
}
