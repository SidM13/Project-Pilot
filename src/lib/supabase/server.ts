import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createDemoClient } from "@/lib/demo/client";
import { DEMO_SESSION_COOKIE, isDemoMode, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/** Supabase client bound to the signed-in user's session — every query is subject to RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  if (isDemoMode) {
    // Local demo: same query interface over the in-memory demo store (src/lib/demo).
    return createDemoClient(cookieStore.get(DEMO_SESSION_COOKIE)?.value === "1") as unknown as ReturnType<typeof createSupabase>;
  }
  return createSupabase(cookieStore);
}

function createSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
