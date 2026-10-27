export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase's newer publishable key (sb_publishable_…) and the legacy anon JWT are interchangeable here.
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Where data lives. "demo" (default): an in-memory store seeded with the fictional
 * Northwind Advisory portfolio — no database needed, resets on restart.
 * "supabase": the real database through the user's RLS-scoped session.
 */
export const DATA_MODE: "demo" | "supabase" = process.env.PROJECTPILOT_DATA_MODE === "supabase" ? "supabase" : "demo";
export const isDemoMode = DATA_MODE === "demo";

/** Cookie marking a local demo session (demo mode only). */
export const DEMO_SESSION_COOKIE = "pp_demo_session";
