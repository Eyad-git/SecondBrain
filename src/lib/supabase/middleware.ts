import { NextResponse, type NextRequest } from "next/server";

function hasLikelySupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => {
    const n = cookie.name;
    return n.startsWith("sb-") && n.includes("auth-token");
  });
}

/** Soft gate `/dashboard` without remote auth fetch (avoids edge network crashes). */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = hasLikelySupabaseSessionCookie(request);

  if (!hasSession && path.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next({ request });
}
