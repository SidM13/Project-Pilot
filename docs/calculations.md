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

## Findings (`findings.ts`)
Severity scale: critical > high > medium > low. "Bump" raises one level.

| Rule | Fires when | Severity |
|---|---|---|
| `blocked_task` | status = blocked | from priority; bumped if critical-path, slack ≤ 2 working days, or ≥ 3 downstream tasks |
| `overdue_task` | open, due before reference date, not blocked | from priority (critical → high); bumped if ≥ 7 days late or critical-path |
| `dependency_wait` | should have started, waits on an overdue (not blocked) task | one below priority |
| `milestone_overdue` | open milestone past due | high |
| `milestone_at_risk` | open milestone due within 10 working days and (a) an owner's remaining hours on it exceed their capacity before it is due → high, or (b) a linked task is blocked/overdue → medium |
| `behind_schedule` | schedule variance < −10 pts | medium; high below −25 |
| `budget_overrun` | EAC > budget | medium; high ≥ 3% over; critical ≥ 10% over |
| `budget_headroom` | 0 ≤ variance < 10% of budget | low |
| `resource_overload` | a member with work on the project is > 100% loaded | medium; high ≥ 130%; one level lower if none of their work on this project is critical-path |

**Blocked-task slack**: the longest chain of dependent work from the blocked task through downstream tasks of the same milestone, each task taking `ceil(remaining ÷ owner daily capacity)` working days, compared with working days left until the milestone. Assumes the blocker clears on the reference date and owners work only on this chain — an optimistic bound. A capacity-aware forecast replaces it in Stage 2.

## Health score (`health.ts`)
`100 − Σ category penalties`. Points per finding: critical 25, high 15, medium 8, low 3. Caps: schedule 50, budget 25, resources 15. Bands: ≥ 75 on track, 50–74 at risk, < 50 critical.

## Decisions Requiring Attention (`decisions.ts`)
Selected findings, each with a rule-based recommended action:
- **Resource overload** (one per member, all severities): greedy reassignment of the member's non-blocked work in the window (not-started first, then largest) to a member of the **same discipline**, preferring people already on that project, whose load stays ≤ 90% afterwards. Capacity promised to one recommendation is not offered to the next. If nobody qualifies, the action is to defer the latest non-critical not-started task. Milestone capacity risks caused by the same member are folded into this decision.
- **Blocked task** (high+): escalate; latest clear-by date from slack; re-baseline if slack < 0.
- **Milestone overdue**, **milestone at risk (capacity)**, **budget overrun**, **overdue task** (high+), **behind schedule** (high+).

Ranking: severity, then rule order (blocked, milestone overdue, overload, milestone at risk, budget overrun, overdue task, behind schedule), then project name.

## Portfolio metrics (`index.ts`)
Active projects (not archived/completed) · needing intervention (health not on track) · overdue milestones · budget exposure (Σ max(0, EAC − budget)) · critical deadlines (open milestones and critical-path tasks due within 14 calendar days).
