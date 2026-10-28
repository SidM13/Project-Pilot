# ProjectPilot AI

**Know what is at risk. Decide what to do next.**

AI-powered project tracking and decision support for project managers running **Waterfall** and **Agile** projects. ProjectPilot turns tasks, hours, capacity and spend into clear answers — what is at risk, what it will cost, who is overloaded and what to do next — with the arithmetic shown. All figures come from deterministic, tested TypeScript; Gemini only explains them.

**Navigation:** Home · Projects (Overview, Tasks, Timeline, Budget, Team) · AI Copilot · Reports.
- **Waterfall:** phases and milestones, dependencies, Gantt chart with baseline and forecast overrun, critical path.
- **Agile:** backlog, sprints with goals, story points, sprint board, velocity and over-commitment warnings, releases.
- **Budget:** planned, actual, remaining and projected completion cost; task-level planned cost and cost to complete.
- **Team:** roles, hourly cost, capacity, workload across projects, scheduling conflicts.
- **AI Copilot:** ask about deadline risk, budget, priorities, workload, cost reduction, milestone delays or a weekly summary. Each answer separates confirmed facts, forecasts and assumptions; Gemini's explanation is grounded in those figures.

- How every number is produced: [`docs/calculations.md`](docs/calculations.md)
- Architecture, stages and known limitations: [`docs/architecture.md`](docs/architecture.md)
- Conventions for contributors and coding agents: [`CLAUDE.md`](CLAUDE.md)

## Quick start (local demo — no database)

```bash
npm install
cp .env.local.example .env.local   # optional: add GEMINI_API_KEY and GEMINI_MODEL for AI explanations
npm run build && npm start         # or npm run dev
```
Open http://localhost:3000 → **Open demo workspace**. The app runs on fictional, internally consistent demonstration data held in memory (labelled throughout the UI); it resets when the server restarts. Everything except multi-user accounts works in this mode.

## Public demo on GitHub Pages (static)

A separate static build of the demo is published at **https://sidm13.github.io/Project-Pilot/**.

- Built with `npm run build:pages` (`NEXT_BUILD_TARGET=pages`): a static export under `/Project-Pilot/`. Only `*.static.tsx` route files are routes; server routes, the proxy and server actions are not in this build.
- Data lives only in the visitor's browser (localStorage), seeded from the same demo dataset. "Reset demo data" restores it.
- No Supabase and no Gemini: their variables are forced empty and live AI is off. The AI Copilot still answers every question from the engine (labelled "AI explanation off"); two clearly labelled pre-generated Gemini examples are shown only for the flagship What-if scenario on unmodified data.
- Returning visitors get the new demo data automatically (storage key `projectpilot-demo-v2`).
- `npm run preview:pages` serves `out/` at http://localhost:4000/Project-Pilot/ for a local check.
- `.github/workflows/pages.yml` deploys on every push to `main` after the secret scans (repository history and generated site), tests, typecheck, lint and build all pass. It uses no secrets. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.

## Security checks

`npm run security:scan` scans tracked/untracked files and the full git history; `build:pages` also scans the generated site. Both fail on credential formats (Google/Gemini, Supabase, JWTs, database URLs with passwords, private keys, tokens), credential files (`.env*`, keys), source maps or Supabase/Gemini endpoints in the public build, and — locally — any actual `.env.local` value. Values are never printed.

## Setup (database mode)

Requirements: Node 22+, a Supabase project (free tier is fine). Set `PROJECTPILOT_DATA_MODE=supabase`.

1. **Install** — `npm install`
2. **Configure** — `cp .env.local.example .env.local` and fill in, from Supabase → Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (API Keys; legacy `…_ANON_KEY` also accepted)
   - `SUPABASE_SECRET_KEY` (API Keys — used only by `scripts/`, never by the app; legacy `SUPABASE_SERVICE_ROLE_KEY` also accepted)
   - `SUPABASE_DB_URL` (Database → connection string, session pooler URI)
   - `DEMO_EMAIL`, `DEMO_PASSWORD` (any values; the setup script creates this user)
3. **Auth settings** — Authentication → Providers → Email: for a local prototype, turn off "Confirm email" so sign-ups land straight in the app.
4. **Database** — `npm run db:push` applies `supabase/migrations`.
   If this Supabase project previously hosted the earlier prototype, first run `supabase/scripts/drop_legacy_prototype.sql` in the SQL editor.
5. **Demo workspace** — `npm run demo:setup` creates the demo user and seeds "Demo — Northwind Advisory" pinned to `DEMO_REFERENCE_DATE` (default 2026-11-16).
6. **Run** — `npm run dev`, open http://localhost:3000, choose **Open demo workspace**.

## Verify

```bash
npm test                 # engine, planning, Copilot, demo-scenario and server-action tests
npm run typecheck
npm run lint
npm run build            # also checks Cache Components / Suspense rules
npm run verify:security  # RLS isolation + integrity checks against your Supabase project
```

## Deploy (Vercel)
Set the same environment variables in the Vercel project, except `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which the app does not need. Run migrations and `demo:setup` from your machine.
