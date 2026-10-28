import type { NextConfig } from "next";

const css = { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } };

/** Full-stack app (Vercel / Node): server components, server actions, Supabase or in-memory demo store. */
const serverConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: { rules: css },
};

/**
 * GitHub Pages build (NEXT_BUILD_TARGET=pages): a static export of the public demo.
 * - Only `*.static.tsx` route files are routes, so server routes, the proxy and server
 *   actions are never part of this build.
 * - Server-only modules are swapped for browser equivalents that run the same action
 *   code against the in-browser demo store (persisted in localStorage).
 * - No credentials: Supabase variables are forced empty and Gemini is not reachable.
 */
const BASE_PATH = process.env.PAGES_BASE_PATH ?? "/Project-Pilot";
const generated = (name: string) => `./src/static/generated/actions/${name}.ts`;
const pagesConfig: NextConfig = {
  output: "export",
  basePath: BASE_PATH,
  trailingSlash: true,
  images: { unoptimized: true },
  pageExtensions: ["static.tsx"],
  productionBrowserSourceMaps: false,
  // Route types here cover only the static routes; the whole codebase is type-checked
  // separately against the server build (`npm run typecheck`), which CI runs first.
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_STATIC_DEMO: "1",
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  },
  turbopack: {
    rules: css,
    resolveAlias: {
      "server-only": "./src/static/shims/empty.ts",
      "next/headers": "./src/static/shims/next-headers.ts",
      "next/cache": "./src/static/shims/next-cache.ts",
      "@/lib/supabase/server": "./src/static/supabase.ts",
      "@/lib/data/workspace": "./src/static/data/workspace.ts",
      "@/lib/ai": "./src/static/ai/config.ts",
      "@/lib/ai/service": "./src/static/ai/service.ts",
      "@/actions/auth": "./src/static/actions/auth.ts",
      "@/actions/workspace": "./src/static/actions/workspace.ts",
      "@/actions/projects": generated("projects"),
      "@/actions/tasks": generated("tasks"),
      "@/actions/milestones": generated("milestones"),
      "@/actions/budget": generated("budget"),
      "@/actions/team": generated("team"),
      "@/actions/simulations": generated("simulations"),
      "@/actions/ai": generated("ai"),
    },
  },
};

export default process.env.NEXT_BUILD_TARGET === "pages" ? pagesConfig : serverConfig;
