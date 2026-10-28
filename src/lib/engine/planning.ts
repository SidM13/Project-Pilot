import type { BudgetEntry, Sprint, Task, TaskDependency, TeamMember, Workspace } from "@/lib/types";
import { buildGraph } from "./graph";
import { hourlyRate } from "./cost";
import { workingDaysDiff, type Forecast } from "./forecast";
import { isOpen, remainingHours } from "./progress";
import type { MemberLoad } from "./capacity";

// Methodology views: Agile sprint metrics, Waterfall critical path and baseline
// variance, task-level cost, and team conflicts. Pure and deterministic; dates come
// from the capacity forecast (the single source of finish dates) and the records.

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Agile ────────────────────────────────────────────────────────────────────

/** Committed points above average velocity by more than this share are flagged. */
export const OVERCOMMIT_PERCENT = 20;

export type SprintState = "completed" | "active" | "upcoming";

export interface SprintMetrics {
  sprint: Sprint;
  state: SprintState;
  committedPoints: number;
  completedPoints: number;
  /** Open tasks in the sprint that have no story points. */
  unpointedTasks: number;
  remainingHours: number;
  taskIds: string[];
}

export interface AgileMetrics {
  sprints: SprintMetrics[];
  active: SprintMetrics | null;
  /** Average completed points of completed sprints; null until one sprint has finished. */
  velocity: number | null;
  completedSprintCount: number;
  backlogTaskIds: string[];
  backlogPoints: number;
  /** Open points not yet done (all sprints + backlog). */
  openPoints: number;
  /** ceil(openPoints ÷ velocity); null without a velocity. */
  sprintsToFinish: number | null;
  /** Active sprint commitment vs velocity, when both exist. */
  overcommit: { committed: number; velocity: number; percentOver: number } | null;
}

export function sprintState(s: Sprint, referenceDate: string): SprintState {
  if (s.end_date < referenceDate) return "completed";
  if (s.start_date > referenceDate) return "upcoming";
  return "active";
}

export function computeAgile(sprints: Sprint[], tasks: Task[], referenceDate: string): AgileMetrics {
  const ordered = [...sprints].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));
  const metrics = ordered.map((sprint): SprintMetrics => {
    const own = tasks.filter((t) => t.sprint_id === sprint.id);
    return {
      sprint,
      state: sprintState(sprint, referenceDate),
      committedPoints: own.reduce((s, t) => s + (t.story_points ?? 0), 0),
      completedPoints: own.filter((t) => t.status === "done").reduce((s, t) => s + (t.story_points ?? 0), 0),
      unpointedTasks: own.filter((t) => isOpen(t) && t.story_points === null).length,
      remainingHours: own.reduce((s, t) => s + remainingHours(t), 0),
      taskIds: own.map((t) => t.id),
    };
  });
  const completed = metrics.filter((m) => m.state === "completed");
  const velocity = completed.length ? Math.round((completed.reduce((s, m) => s + m.completedPoints, 0) / completed.length) * 10) / 10 : null;
  const sprintIds = new Set(sprints.map((s) => s.id));
  const backlog = tasks.filter((t) => !t.sprint_id || !sprintIds.has(t.sprint_id));
  const openPoints = tasks.filter(isOpen).reduce((s, t) => s + (t.story_points ?? 0), 0);
  const active = metrics.find((m) => m.state === "active") ?? null;
  const overcommit =
    active && velocity && velocity > 0 && active.committedPoints > velocity * (1 + OVERCOMMIT_PERCENT / 100)
      ? { committed: active.committedPoints, velocity, percentOver: Math.round(((active.committedPoints - velocity) / velocity) * 100) }
      : null;
  return {
    sprints: metrics,
    active,
    velocity,
    completedSprintCount: completed.length,
    backlogTaskIds: backlog.map((t) => t.id),
    backlogPoints: backlog.filter(isOpen).reduce((s, t) => s + (t.story_points ?? 0), 0),
    openPoints,
    sprintsToFinish: velocity && velocity > 0 ? Math.ceil(openPoints / velocity) : null,
    overcommit,
  };
}

// ── Waterfall ────────────────────────────────────────────────────────────────

export interface CriticalPath {
  /** Open tasks from the first to the last link of the chain that sets the forecast finish. */
  taskIds: string[];
  /** Why no chain could be derived, when taskIds is empty. */
  reason: string | null;
}

/**
 * The chain of open tasks driving the project's forecast finish: start at the task that
 * finishes last, then repeatedly step to the upstream open task that finishes latest.
 * Requires dependencies and a schedulable forecast; otherwise says what is missing.
 */
export function criticalPath(projectId: string, tasks: Task[], dependencies: TaskDependency[], plan: Forecast): CriticalPath {
  const open = tasks.filter((t) => t.project_id === projectId && isOpen(t));
  if (!open.length) return { taskIds: [], reason: "Every task is done." };
  const deps = dependencies.filter((d) => d.project_id === projectId);
  if (!deps.length) return { taskIds: [], reason: "Add task dependencies to identify the critical path." };
  const driving = plan.projects.get(projectId)?.drivingTaskId;
  const finishOf = (id: string) => plan.tasks.get(id)?.finish ?? null;
  if (!driving || !finishOf(driving)) return { taskIds: [], reason: "Some work cannot be scheduled (missing capacity or estimates), so the finish date is unknown." };
  const openIds = new Set(open.map((t) => t.id));
  const graph = buildGraph(deps);
  const chain = [driving];
  const seen = new Set(chain);
  for (let current = driving; ; ) {
    const ups = (graph.upstream.get(current) ?? []).filter((u) => openIds.has(u) && !seen.has(u) && finishOf(u));
    if (!ups.length) break;
    ups.sort((a, b) => finishOf(b)!.localeCompare(finishOf(a)!) || a.localeCompare(b));
    current = ups[0];
    chain.push(current);
    seen.add(current);
  }
  return { taskIds: chain.reverse(), reason: null };
}

export interface BaselineVariance {
  taskId: string;
  baselineStart: string | null;
  baselineDue: string | null;
  /** Working days the current due date moved from the baseline (positive = later). */
  dueShift: number | null;
  /** Done: completion vs baseline; open: forecast finish vs baseline (positive = later). */
  finishVariance: number | null;
  finishBasis: "actual" | "forecast" | null;
}

export function baselineVariance(task: Task, plan: Forecast): BaselineVariance {
  const due = task.baseline_due;
  const finish = task.status === "done" ? task.completed_at?.slice(0, 10) ?? null : plan.tasks.get(task.id)?.finish ?? null;
  return {
    taskId: task.id,
    baselineStart: task.baseline_start,
    baselineDue: due,
    dueShift: due && task.due_date ? workingDaysDiff(due, task.due_date) : null,
    finishVariance: due && finish ? workingDaysDiff(due, finish) : null,
    finishBasis: finish ? (task.status === "done" ? "actual" : "forecast") : null,
  };
}

// ── Cost per task ────────────────────────────────────────────────────────────

export interface TaskCost {
  taskId: string;
  rate: number;
  /** Planned hours × owner rate. */
  plannedCost: number;
  /** Budget entries recorded against this task. */
  recordedCost: number;
  /** Remaining hours × owner rate (the task's share of estimate to complete). */
  costToComplete: number;
  /** Rate came from the workspace default (no owner or no hourly cost). */
  defaultRate: boolean;
}

export function taskCosts(tasks: Task[], entries: BudgetEntry[], members: Map<string, TeamMember>, workspace: Workspace): TaskCost[] {
  const recorded = new Map<string, number>();
  for (const e of entries) if (e.task_id) recorded.set(e.task_id, (recorded.get(e.task_id) ?? 0) + e.amount);
  return tasks.map((t) => {
    const rate = hourlyRate(t, members, workspace);
    const member = t.assignee_id ? members.get(t.assignee_id) : undefined;
    return {
      taskId: t.id,
      rate,
      plannedCost: round2(t.planned_hours * rate),
      recordedCost: round2(recorded.get(t.id) ?? 0),
      costToComplete: round2(remainingHours(t) * rate),
      defaultRate: member?.hourly_cost == null,
    };
  });
}

// ── Team conflicts ───────────────────────────────────────────────────────────

export type ConflictKind = "overallocated" | "starts_before_upstream_due" | "inactive_owner" | "forecast_after_due";

export interface Conflict {
  kind: ConflictKind;
  memberId: string | null;
  taskId: string | null;
  detail: string;
}

/**
 * Scheduling conflicts for a set of tasks: people loaded above 100% in the load window,
 * tasks planned to start before an upstream task is due, open tasks owned by an inactive
 * member, and open tasks the capacity forecast finishes after their due date.
 */
export function teamConflicts(
  tasks: Task[],
  dependencies: TaskDependency[],
  members: Map<string, TeamMember>,
  loads: MemberLoad[],
  plan: Forecast,
  overloadThreshold = 100,
): Conflict[] {
  const out: Conflict[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const l of loads) {
    if (l.loadPercent > overloadThreshold && l.tasks.some((x) => taskIds.has(x.taskId))) {
      out.push({ kind: "overallocated", memberId: l.memberId, taskId: null, detail: `${l.name} is at ${l.loadPercent}% of capacity (${l.assignedHours} h of work for ${l.capacityHours} h available in the next 10 working days)` });
    }
  }
  for (const d of dependencies) {
    const t = byId.get(d.task_id);
    const u = byId.get(d.depends_on_id);
    if (!t || !u || !isOpen(t) || !t.start_date || !u.due_date || !isOpen(u)) continue;
    if (t.start_date < u.due_date) out.push({ kind: "starts_before_upstream_due", memberId: t.assignee_id, taskId: t.id, detail: `"${t.title}" is planned to start before "${u.title}" is due` });
  }
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    const m = t.assignee_id ? members.get(t.assignee_id) : undefined;
    if (m && !m.active) out.push({ kind: "inactive_owner", memberId: m.id, taskId: t.id, detail: `"${t.title}" is owned by ${m.name}, who is marked inactive` });
    const f = plan.tasks.get(t.id)?.finish;
    if (t.due_date && f && f > t.due_date) out.push({ kind: "forecast_after_due", memberId: t.assignee_id, taskId: t.id, detail: `"${t.title}" is forecast to finish ${workingDaysDiff(t.due_date, f)} working days after its due date` });
  }
  return out;
}
