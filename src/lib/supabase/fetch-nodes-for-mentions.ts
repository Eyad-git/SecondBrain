"use client";

import { createClient } from "@/lib/supabase/client";
import type { MentionNodeItem } from "@/types/mention";

/** Escape Postgres ILIKE specials so user input stays safe. */
function escapeForLike(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

/** Fetch rows the signed-in user can see (nodes RLS). */
export async function fetchNodesForMentions(
  query: string
): Promise<MentionNodeItem[]> {
  const client = createClient();
  let q = client
    .from("nodes")
    .select("id,title")
    .order("title", { ascending: true })
    .is("archived_at", null)
    .limit(24);

  const trimmed = query.trim();
  if (trimmed.length > 0) {
    q = q.ilike("title", `%${escapeForLike(trimmed)}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[mentions] Failed to fetch nodes:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.title ?? "Untitled",
  }));
}
