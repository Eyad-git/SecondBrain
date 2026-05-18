const UUID_CHARS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function isLikelyUuid(value: string) {
  return UUID_CHARS.test(value.trim());
}

/**
 * TipTap Mention markdown (`createInlineMarkdownSpec`, self‑closing `@` shortcode),
 * e.g. `[@ id="uuid" label="Career"]`
 */
function extractIdsFromTipTapShortcodes(text: string): string[] {
  const out: string[] = [];
  const blocks = text.matchAll(/\[@[^\]]*\]/g);
  for (const match of blocks) {
    const block = match[0];
    const d = block.match(/\bid="([^"]+)"/);
    const s = block.match(/\bid='([^']+)'/);
    const id = d?.[1]?.trim() ?? s?.[1]?.trim();
    if (id && isLikelyUuid(id)) out.push(id.toLowerCase());
  }
  return out;
}

function extractUuidsPlain(text: string): string[] {
  return [...text.matchAll(UUID_REGEX)].map((m) => m[0].toLowerCase());
}

/** Deduped UUIDs referencing `nodes.id` — markdown mentions plus pasted UUIDs. */
export function extractMentionedNodeIds(text: string): string[] {
  const set = new Set<string>();
  extractIdsFromTipTapShortcodes(text).forEach((id) => set.add(id));
  extractUuidsPlain(text).forEach((id) => set.add(id));
  return [...set];
}
