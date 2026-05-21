import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const createSchema = z.object({
  accessToken: z.string().min(1).max(6000),
  requestId: z.string().uuid().optional(),
});

function authHeader(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL("https://photospicker.googleapis.com/v1/sessions");
    if (body.requestId) url.searchParams.set("requestId", body.requestId);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: authHeader(body.accessToken),
      body: JSON.stringify({}),
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
        { error: `Could not create Google Photos picker session: ${message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      session: json,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/google-photos/picker-session:post]", error);
    return NextResponse.json(
      { error: "Failed to create Google Photos picker session." },
      { status: 500 }
    );
  }
}
