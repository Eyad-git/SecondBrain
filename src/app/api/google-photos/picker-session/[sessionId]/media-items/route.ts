import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const querySchema = z.object({
  accessToken: z.string().min(1).max(6000),
  pageToken: z.string().max(2000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
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
      pageToken: url.searchParams.get("pageToken") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const target = new URL("https://photospicker.googleapis.com/v1/mediaItems");
    target.searchParams.set("sessionId", sessionId);
    if (parsed.pageToken) target.searchParams.set("pageToken", parsed.pageToken);
    if (parsed.pageSize) target.searchParams.set("pageSize", String(parsed.pageSize));

    const response = await fetch(target.toString(), {
      method: "GET",
      headers: authHeader(parsed.accessToken),
      cache: "no-store",
    });
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
        { error: `Could not list picked media items: ${message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ result: json });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/google-photos/picker-session/media-items:get]", error);
    return NextResponse.json(
      { error: "Failed to list picked Google Photos media items." },
      { status: 500 }
    );
  }
}
