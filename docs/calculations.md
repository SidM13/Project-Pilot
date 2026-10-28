# Calculation rules

Every figure in ProjectPilot is produced by these rules in `src/lib/engine`. They are deterministic: the same records and reference date always give the same result. No AI model participates.

**Reference date** — the workspace's pinned `reference_date` (demo) or today in UTC. Working days are Monday–Friday; public holidays are not modelled.

## Effort and progress (`progress.ts`)
| Quantity | Rule |
|---|---|
| Remaining hours | 0 if done; else the recorded estimate; else `max(planned − actual, 0)` |
| Earned hours | planned if done; else `clamp(planned − remaining, 0, planned)` |
| Progress % | Σ earned ÷ Σ planned |
| Expected % | elapsed calendar days ÷ planned duration (start → target) |
| Schedule variance | progress % − expected % (percentage points; negative = behind) |

## Cost (`cost.ts`)
| Quantity | Rule |
|---|---|
| Actual cost (AC) | Σ recorded budget entries |
| Estimate to complete (ETC) | Σ remaining hours × owner hourly cost (workspace default rate if unknown) |
| Estimate at completion (EAC) | AC + ETC |
| Budget variance | budget − EAC (negative = forecast overrun) |
| Burn % | AC ÷ budget |

Limitations: future non-labor costs are not forecast; labor actuals must be recorded as budget entries (actual hours are effort, not cost).

## Team load (`capacity.ts`)
Window = the 10 working days starting at the reference date. A task's remaining hours are spread evenly across its working days from `max(start, window start)` to its due date; the share inside the window counts. Overdue tasks and tasks without a due date count in full.
Load % = hours in window ÷ (weekly capacity ÷ 5 × 10). **Overloaded** above 100%.

## Capacity forecast (`forecast.ts`)
A day-by-day, resource-levelled simulation from the reference date. It is a calculation from stated capacity and estimates, **not** a prediction (no historical velocity is applied).
- Each person has `weekly capacity ÷ 5` hours per working day and works their *ready* tasks one at a time, ordered: critical path → priority → due date → id. Capacity left after finishing a task flows to the next one the same day.
- A task is ready when every upstream task has finished (it starts the next working day), its planned start date has arrived, and — if blocked — its blocker has cleared: on the recorded **expected-to-clear** date (`tasks.blocked_until`), or the reference date when none is recorded (flagged as optimistic).
- People are shared across projects, so one person's queue delays every project they work on. Unassigned tasks run at the workspace default capacity with no contention (flagged).
- Milestone / project forecast = latest forecast finish of its open tasks; the task finishing last is the **driving task**. Slip = signed working days from due date to forecast. Work that cannot be scheduled within 520 working days (e.g. zero capacity) gives an unknown date.
- **Blocker impact** re-runs the forecast with only that blocker's clearance changed: slip as planned, slip if cleared today, extra slip per further week blocked, and the latest clear date that still holds the milestone (searched up to 15 working days).

## Findings (`findings.ts`)
Severity scale: critical > high > medium > low. "Bump" raises one level.

| Rule | Fires when | Severity |
|---|---|---|
| `blocked_task` | status = blocked | from priority; bumped if critical-path, forecast slip or ≤ 2 working days of clearance margin, or ≥ 3 downstream tasks |
| `overdue_task` | open, due before reference date, not blocked | from priority (critical → high); bumped if ≥ 7 days late or critical-path |
| `dependency_wait` | should have started, waits on an overdue (not blocked) task | one below priority |
| `milestone_overdue` | open milestone past due | high |
| `milestone_forecast_late` | capacity forecast finishes an open milestone after its due date | medium; high ≥ 5 working days late; critical ≥ 10 |
| `project_forecast_late` | capacity forecast finishes the project after its target date | as above |
| `milestone_at_risk` | forecast holds, but a milestone due within 10 working days has blocked or overdue linked work | medium |
| `behind_schedule` | schedule variance < −10 pts | medium; high below −25 |
| `budget_overrun` | EAC > budget | medium; high ≥ 3% over; critical ≥ 10% over |
| `budget_headroom` | 0 ≤ variance < 10% of budget | low |
| `resource_overload` | a member with work on the project is > 100% loaded | medium; high ≥ 130%; one level lower if none of their work on this project is critical-path |

A blocked task's impact is measured on the earliest open milestone it (or anything downstream of it) belongs to, using the blocker-impact re-runs above. Forecast-late findings cite the driving task, what it waits on, and its owner's load.

## Health score (`health.ts`)
`100 − Σ category penalties`. Points per finding: critical 25, high 15, medium 8, low 3. Caps: schedule 50, budget 25, resources 15. Bands: ≥ 75 on track, 50–74 at risk, < 50 critical.

## Decisions Requiring Attention (`decisions.ts`)
Selected findings, each with a rule-based recommended action:
- **Resource overload** (one per member, all severities): greedy reassignment of the member's non-blocked work in the window (not-started first, then largest) to a member of the **same discipline**, preferring people already on that project, whose load stays ≤ 90% afterwards. Capacity promised to one recommendation is not offered to the next. If nobody qualifies, the action is to defer the latest non-critical not-started task. Milestone capacity risks caused by the same member are folded into this decision.
  Forecast slips whose driving task belongs to this member (and are not caused by a blocker) are folded into this decision.
- **Blocked task** (high+): escalate to the latest clear date that holds the milestone, else re-baseline. Forecast slips with a blocked task anywhere upstream of their driving task are folded in as "knock-on" evidence.
- **Milestone/project forecast late** (high+, not already folded): add capacity to the critical chain, reduce scope or agree a new date.
- **Milestone overdue**, **budget overrun**, **overdue task** (high+), **behind schedule** (high+).

Ranking: severity, then rule order (blocked, milestone overdue, overload, milestone forecast late, project forecast late, budget overrun, overdue task, behind schedule), then project name.

## Decision Simulator (`simulate.ts`)
`simulate(snapshot, projectId, scenario)` deep-copies the snapshot (`structuredClone`), applies one change to the copy, and runs `analyzeWorkspace` on both. The input is never mutated (tested), and nothing is written.

| Scenario | Change to the copy | Notes |
|---|---|---|
| Reallocate resource | task `assignee_id` → new member | forecast re-levels both people's queues across projects; ETC re-costed at the new owner's rate; discipline mismatch flagged |
| Adjust deadline | milestone `due_date` or project `target_date` | forecast finish is unchanged (dates do not change effort); downstream milestones and dependent tasks planned to start before the new date are listed |
| Reduce scope | selected unfinished tasks get `deferred_at` | deferred tasks leave every calculation; dependants proceed without them; hours already spent stay in actual cost |

Compared measures: projected completion, schedule variance (working days vs target), projected cost (EAC), budget variance, remaining effort, **tasks at risk** (open tasks that are blocked, unschedulable, or forecast to finish after their due date), health score, per-milestone forecast, and forecast changes in other projects.

**Apply** is a separate server action: it re-validates the scenario and re-simulates against current records (client results are never trusted), writes only the listed record changes, stores the server-computed comparison in `simulations`, and logs an activity event. Applied simulations are immutable (RLS).

## Methodology views (`planning.ts`)
**Agile.** A sprint is *completed* when it ended before the reference date, *upcoming* when it starts after it, otherwise *active*. Committed points = Σ story points of the sprint's tasks; completed points = Σ points of its done tasks.
| Quantity | Rule |
|---|---|
| Velocity | average completed points over completed sprints (null until one sprint has ended) |
| Overcommitted | active sprint's committed points > velocity × (1 + 20%) — `OVERCOMMIT_PERCENT` |
| Sprints to finish | ⌈open points ÷ velocity⌉ |
| Backlog | tasks with no sprint (or a sprint outside the project) |
Story points size work relatively; **hours** still drive every date, cost and load figure.

**Waterfall.** Phases are the project's milestones in due-date order.
- **Critical path**: start at the open task that sets the project's forecast finish (the forecast's driving task) and repeatedly step to its upstream open task with the latest forecast finish. Requires dependencies and a schedulable forecast; otherwise the reason is shown instead of a path.
- **Baseline variance** (per task with a baseline due date): due shift = working days from baseline due to current due; finish variance = working days from baseline due to the completion date (done) or forecast finish (open). "Set baseline" copies every task's current start/due into its baseline.

**Task cost.** Planned cost = planned hours × owner rate; cost to complete = remaining hours × owner rate (workspace default rate when there is no owner or hourly cost); recorded = Σ budget entries linked to the task.

**Team conflicts** (per project): a member with work on the project above 100% load; an open task planned to start before an open upstream task is due; an open task owned by an inactive member; an open task whose forecast finish is after its due date.

**Budget warnings** (Home) list projects forecast to overrun, or with less than `HEADROOM_WARNING_PERCENT` (10%) of budget left after the forecast.

## AI Copilot (`copilot.ts`)
Questions are classified by keyword rules into seven intents; named projects and milestones are matched by name. Each intent is answered by the engine:
| Intent | Answer |
|---|---|
| Deadline risk | per project: forecast finish vs target, late milestones; top rule-based decisions |
| Budget | remaining budget (budget − actual) vs cost to complete; the difference is the headroom or shortfall |
| Priorities | open tasks scored: critical-path chain 40, blocked 30, overdue 25 or due within 5 working days 15, forecast past due 15, marked critical 10, priority 0–8; top 6 with reasons |
| Overloaded | load per person (capacity rules above); overload decisions |
| Cost reduction | for non-critical, non-chain, non-blocked open work: reassignment to a same-discipline, lower-rate, active colleague with free hours (saving = remaining hours × rate difference), else deferral of unstarted work (removes its cost to complete). Protected work is never proposed |
| Milestone delay | on a `structuredClone`: the milestone finishes N working days after its forecast; open tasks downstream of its work (outside it) cannot start until the next working day; the forecast is re-run. Project finish = max(re-run finish, delayed milestone). Cost is unchanged (no effort added) |
| Weekly summary | portfolio metrics, per-project health / forecast / projected cost, active sprint vs velocity, top decisions |
Every answer lists facts (records), forecasts (calculations) and assumptions separately; recommendations are rule-based. Gemini only explains the answer (`explainCopilot`, recomputed server-side) through `runGrounded()`; any figure not in the answer is rejected.

## Risk history (`lib/data/risk-history.ts`)
After every logged change, and when the Risk Intelligence page is viewed, each live project's result (health score and status, finding ids/severities/titles, forecast finish and slip, budget variance, reference date) is hashed with SHA-256. A `risk_snapshots` row is appended only when the hash differs from that project's latest snapshot.

## Portfolio metrics (`index.ts`)
Active projects (not archived/completed) · needing intervention (health not on track) · overdue milestones · budget exposure (Σ max(0, EAC − budget)) · critical deadlines (open milestones and critical-path tasks due within 14 calendar days).

## AI grounding (`lib/ai`)
The model never computes. Its context is built from engine output with every delta pre-computed (`simulationContext`, `buildBriefFacts`). Responses must be JSON matching a Zod schema; then `findUngroundedFigures` extracts every number, amount and month-day date from the response and rejects the whole response if any one does not appear in the context. Rejected, malformed, truncated, blocked or rate-limited responses are reported as such — never shown as if successful. Validated responses are cached by `sha256(prompt version, kind, model, context)`; only fresh calls count towards `AI_HOURLY_LIMIT` per user per hour.
