import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function safeRelativePath(candidate: string | null) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/dashboard";
  }
  return candidate;
}

/**
 * Handles Supabase email confirmation / magic-link redirects (?code=...).
 */
export async function GET(request: Request) {
  const urlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!urlEnv || !anon) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRelativePath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(urlEnv, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore cookie writes that fail outside route context */
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback]", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
