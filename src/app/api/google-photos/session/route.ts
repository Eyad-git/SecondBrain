import { NextResponse } from "next/server";
import { z } from "zod";

import { GOOGLE_PHOTOS_TOKEN_COOKIE } from "@/lib/google-photos/token";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TOKEN_MAX_AGE_SEC = 60 * 60 * 24;

const postSchema = z.object({
  accessToken: z.string().min(1).max(6000),
});

function setTokenCookie(res: NextResponse, accessToken: string) {
  res.cookies.set(GOOGLE_PHOTOS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SEC,
  });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const cookieStore = await import("next/headers").then((m) => m.cookies());
    const token = cookieStore.get(GOOGLE_PHOTOS_TOKEN_COOKIE)?.value?.trim() ?? "";
    return NextResponse.json({ connected: token.length > 0 });
  } catch (error) {
    console.error("[api/google-photos/session:get]", error);
    return NextResponse.json({ connected: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = postSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    setTokenCookie(res, body.accessToken);
    return res;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/google-photos/session:post]", error);
    return NextResponse.json(
      { error: "Failed to persist Google Photos session." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(GOOGLE_PHOTOS_TOKEN_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (error) {
    console.error("[api/google-photos/session:delete]", error);
    return NextResponse.json(
      { error: "Failed to clear Google Photos session." },
      { status: 500 }
    );
  }
}
