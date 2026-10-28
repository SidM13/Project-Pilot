import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE, isDemoMode, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

/** Refreshes the auth cookie on every request and routes signed-out users to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (isDemoMode) return gate(request, response, request.cookies.get(DEMO_SESSION_COOKIE)?.value === "1");
  if (!isSupabaseConfigured) return response; // the login page explains how to configure

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Must run before any redirect decision so the refreshed token is kept.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return gate(request, response, !!user);
}

function gate(request: NextRequest, response: NextResponse, signedIn: boolean) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // The portfolio overview moved from /command-center to /home; keep old links working.
  if (pathname === "/command-center" || pathname.startsWith("/command-center/")) return redirectTo(signedIn ? "/home" : "/login");
  if (!signedIn && !isPublic) return redirectTo("/login");
  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) return redirectTo("/home");
  return response;
}
