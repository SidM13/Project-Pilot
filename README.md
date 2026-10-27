# ProjectPilot AI

**Know what is at risk. Decide what to do next.**

Decision intelligence for project leads at consulting and professional-services firms. ProjectPilot turns task, effort, capacity and spend records into ranked decisions — each with its evidence, its calculated impact and a rule-based recommended action. All figures come from deterministic, tested TypeScript; AI (Stage 4) only explains.

- How every number is produced: [`docs/calculations.md`](docs/calculations.md)
- Architecture, stages and known limitations: [`docs/architecture.md`](docs/architecture.md)
- Conventions for contributors and coding agents: [`CLAUDE.md`](CLAUDE.md)

## Setup

Requirements: Node 22+, a Supabase project (free tier is fine).

1. **Install** — `npm install`
2. **Configure** — `cp .env.local.example .env.local` and fill in, from Supabase → Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (API)
   - `SUPABASE_SERVICE_ROLE_KEY` (API — used only by `scripts/`, never by the app)
   - `SUPABASE_DB_URL` (Database → connection string, session pooler URI)
   - `DEMO_EMAIL`, `DEMO_PASSWORD` (any values; the setup script creates this user)
3. **Auth settings** — Authentication → Providers → Email: for a local prototype, turn off "Confirm email" so sign-ups land straight in the app.
4. **Database** — `npm run db:push` applies `supabase/migrations`.
   If this Supabase project previously hosted the earlier prototype, first run `supabase/scripts/drop_legacy_prototype.sql` in the SQL editor.
5. **Demo workspace** — `npm run demo:setup` creates the demo user and seeds "Demo — Northwind Advisory" pinned to `DEMO_REFERENCE_DATE` (default 2026-11-16).
6. **Run** — `npm run dev`, open http://localhost:3000, choose **Open demo workspace**.

## Verify

```bash
npm test                 # engine unit + demo-scenario tests
npm run typecheck
npm run lint
npm run build            # also checks Cache Components / Suspense rules
npm run verify:security  # RLS isolation + integrity checks against your Supabase project
```

## Deploy (Vercel)
Set the same environment variables in the Vercel project, except `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which the app does not need. Run migrations and `demo:setup` from your machine.
