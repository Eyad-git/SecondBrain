import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

function serializeParagraphContent(node: PMNode): string {
  let s = "";
  node.forEach((child) => {
    if (child.isText) {
      s += child.text ?? "";
      return;
    }
    const name = child.type.name;
    if (name === "mention") {
      const id = String(child.attrs?.id ?? "");
      const lab = String(child.attrs?.label ?? "");
      const escaped = lab.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      s += `[@ id="${id}" label="${escaped}"]`;
      return;
    }
    if (name === "hardBreak") {
      s += "\n";
    }
  });
  return s;
}

/** Serialize editor to wire text (mention shortcodes preserved for `/api/chat`). */
export function serializeAskDocument(editor: Editor | null): string {
  if (!editor || editor.isDestroyed) return "";

  const parts: string[] = [];
  editor.state.doc.forEach((block) => {
    if (block.type.name === "paragraph" || block.type.name === "heading") {
      parts.push(serializeParagraphContent(block));
    }
  });

  return parts
    .map((chunk) => chunk.trimEnd())
    .join("\n\n")
    .trim();
}
