import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GOOGLE_PHOTOS_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
    if (!clientId) {
      return NextResponse.json(
        {
          error:
            "Missing NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID. Add it to your environment.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clientId,
      scope: GOOGLE_PHOTOS_SCOPE,
    });
  } catch (error) {
    console.error("[api/google-photos/config:get]", error);
    return NextResponse.json(
      { error: "Failed to load Google Photos configuration." },
      { status: 500 }
    );
  }
}
