import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh auth cookies and gate `/dashboard` + `/login` redirects. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon) {
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path.startsWith("/dashboard")) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    mergeCookies(response, redirect);
    return redirect;
  }

  if (user && path === "/login") {
    const redirect = NextResponse.redirect(new URL("/dashboard", request.url));
    mergeCookies(response, redirect);
    return redirect;
  }

  return response;
}

function mergeCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value }) => {
    if (typeof value === "string" && value.length > 0) {
      to.cookies.set(name, value);
    }
  });
}
