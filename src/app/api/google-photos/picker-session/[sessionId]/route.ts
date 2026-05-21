import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
  accessToken: z.string().min(1).max(6000),
});

function authHeader(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await ctx.params;
    const url = new URL(req.url);
    const parsed = querySchema.parse({
      accessToken: url.searchParams.get("accessToken") ?? "",
    });

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(
      `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: authHeader(parsed.accessToken),
        cache: "no-store",
      }
    );
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        json &&
        typeof json === "object" &&
        "error" in json &&
        (json as { error?: { message?: unknown } }).error &&
        typeof (json as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? String((json as { error: { message: string } }).error.message)
          : `HTTP ${response.status}`;
      return NextResponse.json(
        { error: `Could not read picker session: ${message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ session: json });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/google-photos/picker-session:get]", error);
    return NextResponse.json(
      { error: "Failed to read Google Photos picker session." },
      { status: 500 }
    );
  }
}
