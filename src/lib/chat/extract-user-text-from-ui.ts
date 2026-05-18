import type { TextUIPart, UIMessage } from "ai";

function isTextUIPart(part: unknown): part is TextUIPart {
  return (
    !!part &&
    typeof part === "object" &&
    "type" in part &&
    (part as { type: unknown }).type === "text" &&
    "text" in part &&
    typeof (part as { text: unknown }).text === "string"
  );
}

/** Concatenate user-visible text across all user turns (simple @ / UUID discovery). */
export function stringifyUserUiMessages(messages: UIMessage[]): string {
  const chunks: string[] = [];

  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const part of m.parts) {
      if (!isTextUIPart(part)) continue;
      chunks.push(part.text);
    }
  }

  return chunks.join("\n");
}
