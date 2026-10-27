# Architecture & delivery plan

## Who it is for
Project managers and operations leads at small consulting / professional-services firms running several client projects with tight capacity and budgets. Task tools show *status*; ProjectPilot answers *what is at risk, why, what it costs, and which action helps most* — with the arithmetic shown.

## Core workflow (five-minute demo)
1. **Command Center** ranks decisions across projects → ERP Implementation is first: vendor integration blocked, zero-to-one day of slack before "Data migration complete".
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
`workspaces`, `workspace_members`, `team_members`, `projects`, `milestones`, `tasks`, `task_dependencies`, `budget_entries`, `activity_events`. Composite FKs keep every child row in its parent's workspace; a trigger rejects circular dependencies. Later stages add only `risk_snapshots` (2), `simulations` (3), `ai_explanations` + `decision_briefs` (4).

## Stages
| Stage | Scope | Status |
|---|---|---|
| 1 Foundation | Design system, auth, workspaces + RLS, project/task/milestone/dependency/budget/team CRUD, activity log, Command Center, engine v1, demo seed | **Done** |
| 2 Risk Intelligence | Capacity-aware forecast (resource-levelled finish dates), Risk Intelligence page, risk snapshots on data change, expanded tests | Next |
| 3 Decision Simulator | Reallocation / deadline / scope scenarios on a cloned snapshot, side-by-side comparison, saved simulations, approve-to-apply | |
| 4 AI layer | Gemini provider abstraction, grounded explanations with Zod-validated JSON, caching, rate limits, decision brief drafting | |
| 5 Polish | Brief editing + PDF, responsive pass, E2E demo test, Vercel deployment guide | |

## Known limitations (Stage 1)
- Schedule impact of a blocker is a **slack bound** (optimistic: blocker clears today, owners focus on the chain). True finish-date forecasting with resource contention is Stage 2.
- No historical velocity: forecasts use stated capacity and remaining-hour estimates, and say so.
- Working days ignore public holidays and leave.
- Cost-to-complete covers labor only; future vendor/licence costs must be recorded when committed.
- Workspace invitations are not built; a workspace has one owner (the creator). The demo uses a shared demo login.
- Light theme only.
