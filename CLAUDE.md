# ProjectPilot AI — project conventions

@AGENTS.md

Decision-intelligence workspace for PMs/ops leads at small consulting and professional-services firms.
Product plan and stage status: `docs/architecture.md`. Calculation rules: `docs/calculations.md`.

## Stack
Next.js 16 App Router (Cache Components on), TypeScript strict, Tailwind v4, shadcn/ui (radix), Supabase (Postgres + Auth + RLS), Zod, Vitest. npm. Gemini arrives in Stage 4 behind `src/lib/ai` (provider abstraction). Never add the Claude/Anthropic API to the app.

## Non-negotiable rules
- **Numbers come from the engine, never from AI.** `src/lib/engine/*` is pure TypeScript: no I/O, no `Date.now()`. "Today" is only ever `getReferenceDate(workspace)` passed in as `referenceDate`.
- **Three layers stay visibly separate in the UI:** Facts (DB records) → Calculated findings (engine) → AI text (Stage 4, labelled as such).
- Every new rule or threshold goes in `docs/calculations.md` and gets a test in `src/lib/engine/__tests__/`.
- Simulations (Stage 3) operate on a cloned `WorkspaceSnapshot`; the only write path is an explicit user-approved server action.
- No dead UI: a nav item, button or chart ships only when it works. Hide unfinished sections (`src/components/layout/nav-items.ts`).

## Data & security
- Tenancy = workspace. Every table has `workspace_id`; child rows use composite FKs `(parent_id, workspace_id)` so cross-workspace links are impossible.
- RLS on every table via `is_member(ws)` / `has_role(ws, roles)`. The app only uses the anon key + user session (`src/lib/supabase/server.ts`). The service-role key is used **only** by `scripts/*.mjs`.
- Reads: `src/lib/data/*` (`getWorkspaceSnapshot`, `getAnalysis`, `getProjectView`), all wrapped in React `cache`. Postgres numerics are converted to numbers there.
- Writes: server actions in `src/actions/*` → Zod schema from `src/lib/validation.ts` → Supabase → `logActivity()` → `refresh()`. Return `ActionResult`; map errors with `fail()`.
- Migrations live in `supabase/migrations` (append new numbered files; never edit applied ones once shared).

## Next.js 16 specifics
- `proxy.ts` (not middleware) refreshes the session and gates routes.
- Cache Components: anything reading cookies/params/pathname must render inside `<Suspense>` (route `loading.tsx` counts). Build fails otherwise — run `npm run build` to check.
- `params`/`searchParams` are promises; use the global `PageProps<"/route">` / `LayoutProps<"/route">` types (`npm run typecheck` regenerates them).

## Design system
- Tokens in `src/app/globals.css`: canvas `#F7F6F3`, surface white, charcoal nav, single accent `#2457C5`, semantic critical/warning/healthy (+ `-soft` backgrounds). Light theme only.
- Inter (UI, `tabular` utility for figures), Source Serif 4 (`font-serif`, page titles only), IBM Plex Mono (dates/ids, sparingly).
- Building blocks in `src/components/system`: `Panel`, `PageHeader`, `MetricStrip`, `Pill`/`SeverityPill`/`HealthPill`/`TaskStatusPill`, `EvidenceList`, `EmptyState`, `SourceLabel`, `Field`, `NativeSelect`, `useActionForm`.
- 6px control radius, 8px panels, 1px borders, no card shadows, no gradients/glow/emoji. Icons only where they carry meaning.

## Demo
- Demo workspace (`is_demo`) is seeded by `seed_demo_workspace()` in `supabase/migrations/0002_demo_seed.sql`, dates relative to `reference_date` (default 2026-11-16, Monday).
- `src/lib/engine/__tests__/fixtures.ts → demoSnapshot()` mirrors that seed; `demo-scenario.test.ts` asserts the narrative (ERP blocker ranked first, Website at risk via Maya's overload, Ops healthy with thin headroom). Change both together.

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:push` · `npm run demo:setup` · `npm run verify:security`
