import { createDemoClient } from "@/lib/demo/client";
import { setDemoPersistence, type Tables } from "@/lib/demo/store";

// Static (GitHub Pages) build: the "database" is the in-browser demo store, saved in
// this visitor's localStorage. No network requests, no credentials.

export const DEMO_STORAGE_KEY = "projectpilot-demo-v1";

if (typeof window !== "undefined") {
  setDemoPersistence({
    load() {
      try {
        const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Tables) : null;
      } catch {
        return null; // storage blocked or corrupt → start from the seeded demo
      }
    },
    save(tables) {
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(tables));
      } catch {
        // Storage full or blocked: the demo keeps working for this page session.
      }
    },
  });
}

export async function createClient() {
  return createDemoClient(true) as unknown as ServerClient;
}

export type ServerClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
