# Architecture & delivery plan

## Who it is for
Project managers and operations leads at small consulting / professional-services firms running several client projects with tight capacity and budgets. Task tools show *status*; ProjectPilot answers *what is at risk, why, what it costs, and which action helps most* — with the arithmetic shown.

## Navigation
Four destinations: **Home** (portfolio, attention list, deadlines, budget warnings, workload) · **Projects** (Waterfall and Agile; each with Overview, Tasks, Timeline, Budget, Team tabs) · **AI Copilot** (questions answered by the engine and explained by Gemini; the What-if planner) · **Reports** (portfolio status summary, project briefs, PDF). Risk analysis (`/risk`), People (`/team`) and the What-if planner (`/simulator`) are reached from those pages. `/command-center` redirects to `/home`.

## Core workflow (five-minute demo)
1. **Home** ranks decisions across projects → ERP Implementation is first: vendor integration blocked until Kestrel's committed date, so "Data migration complete" is forecast 7 working days late (it would hold if cleared by Nov 17).
2. **Evidence**: open the project — facts (tasks, hours, spend) and calculated findings are shown separately, each finding citing its records.
3. **Decision Simulator** *(Stage 3)*: reassign work, move a deadline or cut scope on a copy of the plan.
4. **Compare** current vs proposed: completion date, schedule variance, cost, budget variance, tasks at risk, assumptions.
5. **AI explanation** *(Stage 4)*: Gemini explains the trade-off using only the computed comparison.
6. **Decision brief** *(Stage 4–5)*: editable executive brief, exported as PDF.

## System
```
Browser ─▶ Next.js 16 App Router (RSC + client islands, proxy.ts session refresh)
             reads:  lib/data/* ─▶ Supabase (user session, RLS)
             writes: actions/* ─▶ Zod ─▶ Supabase (RLS) ─▶ activity_events
             lib/engine/*  pure TS: (WorkspaceSnapshot, referenceDate) → findings, health, decisions
             lib/ai/*      (Stage 4) AiProvider interface → Gemini, server-only, cached
```

## Schema (Stage 1)
`workspaces`, `workspace_members`, `team_members`, `projects`, `milestones`, `tasks`, `task_dependencies`, `budget_entries`, `activity_events`. Composite FKs keep every child row in its parent's workspace; a trigger rejects circular dependencies. Migration 0006 restricts updatable columns (workspace demo flag/reference date, brief facts, append-only tables). Later stages add only `risk_snapshots` (2, migration 0003), `simulations` + `tasks.deferred_at` (3, migration 0004), `ai_explanations` + `decision_briefs` (4), and `projects.methodology`, `sprints`, `tasks.story_points / sprint_id / baseline_start / baseline_due` plus Copilot rows in `ai_explanations` (6, migration 0007).

## Stages
| Stage | Scope | Status |
|---|---|---|
| 1 Foundation | Design system, auth, workspaces + RLS, project/task/milestone/dependency/budget/team CRUD, activity log, Command Center, engine v1, demo seed | **Done** |
| 2 Risk Intelligence | Capacity-aware forecast (resource-levelled finish dates), blocker sensitivity, expected-clear dates, Risk Intelligence page (facts / findings / forecast / history), risk snapshots on result change | **Done** (DB verification pending) |
| 3 Decision Simulator | Reallocation / deadline / scope scenarios on a cloned snapshot, side-by-side comparison, saved simulations, approve-to-apply, reversible deferral | **Done** (DB verification pending) |
| 4 AI layer | Gemini provider abstraction, grounded explanations with Zod-validated JSON, figure-grounding check, caching, rate limits, decision brief generator (edit / copy / PDF) | **Done** (DB + live Gemini verification pending) |
| 5 Demo-ready prototype | Local demo mode (in-memory Supabase-compatible adapter seeded from one TypeScript dataset), end-to-end action tests, browser walkthrough, PDF verification, responsive check | **Done** |
| 6 Redesign + methodology | Four-item navigation and light theme; Waterfall (phases, Gantt, baseline, critical path) and Agile (sprints, story points, board, backlog, velocity) on one task model; task-level cost; project Team tab with conflicts; AI Copilot (intent engine + grounded Gemini explanation); portfolio status summary (migration 0007) | **Done** (DB + live Gemini verification pending) |

## Public static demo (GitHub Pages)
A second build target exports the demo as static files for GitHub Pages. Pages are split into shared loaders and views; in the static build the loaders run in the browser against the same demo store (persisted to localStorage), and the generated, directive-free copies of the server actions run the same validated logic locally. Supabase and Gemini are unreachable from this build by construction; secret scans gate deployment.

## Data modes
`PROJECTPILOT_DATA_MODE=demo` (default) swaps the user-scoped Supabase client for `src/lib/demo/client.ts`, an in-memory implementation of the exact query surface the app uses, over a store (`src/lib/demo/store.ts`) that enforces the schema's defaults, completion trigger, unique keys, same-project/acyclic dependencies and cascades. It is seeded from `src/lib/demo/dataset.ts` — the same dataset the engine tests use. Every page, server action, simulation and AI feature runs unchanged. `PROJECTPILOT_DATA_MODE=supabase` uses the real database and migrations 0001–0006, which are kept intact.

## Known limitations
- The forecast is a capacity calculation: people work one task at a time in a fixed order, at their stated capacity. Real multitasking, context switching and estimate error are not modelled.
- Blocked tasks without an expected-clear date are assumed workable today (optimistic, and stated as an assumption).
- Risk history is written after changes made through the app and on Risk page views; edits made directly in the database appear at the next view.
- AI output is rejected if it contains any figure absent from its calculated context; this blocks invented numbers but cannot catch numbers written as words or purely qualitative errors, so AI text is always labelled and editable.
- PDF export uses the browser's print-to-PDF with a print stylesheet.
- The simulator evaluates one change at a time; combined scenarios are not yet supported.
- No historical velocity: forecasts use stated capacity and remaining-hour estimates, and say so.
- Working days ignore public holidays and leave.
- Cost-to-complete covers labor only; future vendor/licence costs must be recorded when committed.
- The GitHub Pages demo keeps each visitor's changes in their own browser; clearing site data or "Reset demo data" restores the seed. Live AI is off there; only two labelled pre-generated examples exist.
- Demo mode is single-user and process-local: data lives in server memory and resets on restart; RLS is not emulated (there is one user). On serverless hosting each instance holds its own copy, so use it for local or single-instance demos.
- Workspace invitations are not built; a workspace has one owner (the creator). The demo uses a shared demo login.
- Light theme only.
