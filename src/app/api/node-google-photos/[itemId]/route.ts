import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GOOGLE_PHOTOS_SETUP_MESSAGE =
  "Node Google Photos context is not initialized yet. Run db/node_google_photos.sql in your Supabase SQL editor.";

function getMissingTableMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("node_google_photos_items") &&
    (normalized.includes("could not find the table") ||
      normalized.includes("relation") ||
      normalized.includes("does not exist"))
  ) {
    return GOOGLE_PHOTOS_SETUP_MESSAGE;
  }
  return null;
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("node_google_photos_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (error) {
      const setupMessage = getMissingTableMessage(error.message);
      if (setupMessage) {
        return NextResponse.json({ error: setupMessage }, { status: 503 });
      }
      return NextResponse.json(
        { error: `Delete failed: ${error.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/node-google-photos:delete]", error);
    return NextResponse.json(
      { error: "Failed to delete node Google Photos context item." },
      { status: 500 }
    );
  }
}
