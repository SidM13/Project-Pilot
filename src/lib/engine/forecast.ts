import type { Milestone, Priority, Project, Task, TaskDependency, TeamMember, Workspace } from "@/lib/types";
import { addDays, addWorkingDays, workingDaysInclusive } from "./dates";
import { buildGraph } from "./graph";
import { dailyCapacity } from "./capacity";
import { isOpen, remainingHours } from "./progress";

// Capacity-aware forecast (deterministic, resource-levelled).
//
// Simulates working days from the reference date. Each day, every person spends
// their daily capacity on their ready tasks in a fixed order (critical path,
// priority, due date, id), finishing one before starting the next. A task is
// ready once all its upstream tasks have finished (finish-to-start, next working
// day), its planned start date has arrived, and — if blocked — its blocker is
// assumed cleared. People are shared across projects, so contention is modelled.
// This is a calculation from stated capacity and estimates, not a prediction.

export const FORECAST_HORIZON_WORKING_DAYS = 520;

export interface ForecastOptions {
  /** Working days after the reference date when blocked tasks become workable. Default 0. */
  blockersClearAfter?: number;
  /** Per-task override of blockersClearAfter (used for sensitivity analysis). */
  blockerClearOverrides?: Map<string, number>;
}

export type ForecastFlag = "unassigned" | "blocked_assumed_cleared" | "blocked_until_date" | "beyond_horizon" | "zero_capacity";

export interface TaskForecast {
  taskId: string;
  start: string | null;
  finish: string | null;
  flags: ForecastFlag[];
}

export interface DateForecast {
  /** Forecast completion date; null if any work runs past the horizon. */
  finish: string | null;
  due: string;
  /** Working days late (positive) or early (negative). Null when finish is null. */
  slipWorkingDays: number | null;
  /** The open task finishing last — what the date depends on. */
  drivingTaskId: string | null;
}

export interface Forecast {
  referenceDate: string;
  tasks: Map<string, TaskForecast>;
  milestones: Map<string, DateForecast>;
  projects: Map<string, DateForecast>;
  assumptions: string[];
}

export interface ForecastInput {
  workspace: Workspace;
  members: TeamMember[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  dependencies: TaskDependency[];
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Signed working days from `from` to `to` (positive when `to` is later, 0 when equal). */
export function workingDaysDiff(from: string, to: string): number {
  if (to === from) return 0;
  return to > from ? workingDaysInclusive(addDays(from, 1), to) : -workingDaysInclusive(addDays(to, 1), from);
}

export function forecast(input: ForecastInput, referenceDate: string, options: ForecastOptions = {}): Forecast {
  const { workspace } = input;
  const members = new Map(input.members.map((m) => [m.id, m]));
  const open = input.tasks.filter(isOpen);
  const openIds = new Set(open.map((t) => t.id));
  const graph = buildGraph(input.dependencies.filter((d) => openIds.has(d.task_id) && openIds.has(d.depends_on_id)));
  const days: string[] = [];
  const dayAt = (i: number) => (days[i] ??= addWorkingDays(referenceDate, i));

  const left = new Map(open.map((t) => [t.id, remainingHours(t)]));
  const startIdx = new Map<string, number>();
  const finishIdx = new Map<string, number>();
  const flags = new Map<string, ForecastFlag[]>(open.map((t) => [t.id, []]));
  const flag = (id: string, f: ForecastFlag) => flags.get(id)!.includes(f) || flags.get(id)!.push(f);

  // Each assignee is a resource; unassigned tasks each get their own resource at the default capacity.
  const resourceOf = (t: Task) => (t.assignee_id && members.has(t.assignee_id) ? t.assignee_id : `unassigned:${t.id}`);
  const capacityOf = (resource: string) =>
    resource.startsWith("unassigned:") ? dailyCapacity(undefined, workspace) : dailyCapacity(members.get(resource), workspace);
  for (const t of open) {
    if (!t.assignee_id || !members.has(t.assignee_id)) flag(t.id, "unassigned");
    if (t.status === "blocked") flag(t.id, t.blocked_until ? "blocked_until_date" : "blocked_assumed_cleared");
  }

  const earliestIdx = new Map(
    open.map((t) => {
      let idx = 0;
      // Index of the first working day on or after the planned start = working days before it.
      if (t.start_date && t.start_date > dayAt(0)) idx = workingDaysInclusive(dayAt(0), addDays(t.start_date, -1));
      if (t.status === "blocked") {
        // Explicit override (sensitivity runs) > recorded expected-clear date > global assumption.
        const recorded = t.blocked_until && t.blocked_until > dayAt(0) ? workingDaysInclusive(dayAt(0), addDays(t.blocked_until, -1)) : 0;
        idx = Math.max(idx, options.blockerClearOverrides?.get(t.id) ?? (t.blocked_until ? recorded : (options.blockersClearAfter ?? 0)));
      }
      return [t.id, idx];
    }),
  );

  const order = [...open].sort(
    (a, b) =>
      Number(b.is_critical) - Number(a.is_critical) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      a.id.localeCompare(b.id),
  );
  const queues = new Map<string, Task[]>();
  for (const t of order) queues.set(resourceOf(t), [...(queues.get(resourceOf(t)) ?? []), t]);

  const ready = (t: Task, day: number) =>
    day >= earliestIdx.get(t.id)! && (graph.upstream.get(t.id) ?? []).every((u) => finishIdx.has(u) && finishIdx.get(u)! < day);

  let remainingTasks = open.length;
  // Tasks with no hours left finish as soon as they are ready, without consuming capacity.
  for (let day = 0; remainingTasks > 0 && day < FORECAST_HORIZON_WORKING_DAYS; day++) {
    for (const [resource, queue] of queues) {
      let capacity = capacityOf(resource);
      for (const t of queue) {
        if (finishIdx.has(t.id) || !ready(t, day)) continue;
        const need = left.get(t.id)!;
        if (need > 0 && capacity <= 0) {
          if (capacityOf(resource) === 0) flag(t.id, "zero_capacity");
          break;
        }
        if (!startIdx.has(t.id)) startIdx.set(t.id, day);
        const used = Math.min(need, capacity);
        capacity -= used;
        left.set(t.id, need - used);
        if (need - used <= 1e-9) {
          finishIdx.set(t.id, day);
          remainingTasks--;
        }
      }
    }
  }

  const tasks = new Map<string, TaskForecast>();
  for (const t of open) {
    if (!finishIdx.has(t.id)) flag(t.id, "beyond_horizon");
    tasks.set(t.id, {
      taskId: t.id,
      start: startIdx.has(t.id) ? dayAt(startIdx.get(t.id)!) : null,
      finish: finishIdx.has(t.id) ? dayAt(finishIdx.get(t.id)!) : null,
      flags: flags.get(t.id)!,
    });
  }

  const summarize = (linked: Task[], due: string): DateForecast => {
    const openLinked = linked.filter(isOpen);
    if (!openLinked.length) return { finish: null, due, slipWorkingDays: null, drivingTaskId: null };
    if (openLinked.some((t) => !tasks.get(t.id)!.finish)) {
      return { finish: null, due, slipWorkingDays: null, drivingTaskId: openLinked.find((t) => !tasks.get(t.id)!.finish)!.id };
    }
    const driving = openLinked.reduce((a, b) => (tasks.get(b.id)!.finish! > tasks.get(a.id)!.finish! ? b : a));
    const finish = tasks.get(driving.id)!.finish!;
    return { finish, due, slipWorkingDays: workingDaysDiff(due, finish), drivingTaskId: driving.id };
  };

  const milestones = new Map(
    input.milestones.filter((m) => !m.completed_at).map((m) => [m.id, summarize(input.tasks.filter((t) => t.milestone_id === m.id), m.due_date)]),
  );
  const projects = new Map(input.projects.map((p) => [p.id, summarize(input.tasks.filter((t) => t.project_id === p.id), p.target_date)]));

  const all = [...tasks.values()];
  const assumptions = [
    "Forecast uses each person's stated weekly capacity (Mon–Fri) and the recorded remaining hours; no historical velocity is applied.",
    "People work their ready tasks one at a time in order: critical path, priority, due date.",
    "A task starts the working day after all its dependencies finish, and not before its planned start date.",
  ];
  const dated = all.filter((t) => t.flags.includes("blocked_until_date")).length;
  if (dated) assumptions.push(`${dated} blocked task${dated === 1 ? " resumes" : "s resume"} on the recorded "expected to clear" date.`);
  const blocked = all.filter((t) => t.flags.includes("blocked_assumed_cleared")).length;
  if (blocked) {
    const n = options.blockersClearAfter ?? 0;
    assumptions.push(`${blocked} blocked task${blocked === 1 ? " has" : "s have"} no expected-clear date and ${blocked === 1 ? "is" : "are"} assumed workable ${n === 0 ? "from the reference date (optimistic)" : `after ${n} working day${n === 1 ? "" : "s"}`}.`);
  }
  const unassigned = all.filter((t) => t.flags.includes("unassigned")).length;
  if (unassigned) assumptions.push(`${unassigned} unassigned task${unassigned === 1 ? " is" : "s are"} forecast at the workspace default capacity with no contention.`);
  if (all.some((t) => t.flags.includes("beyond_horizon"))) assumptions.push("Some work cannot be scheduled within two years (zero capacity or no owner time); those dates are shown as unknown.");

  return { referenceDate, tasks, milestones, projects, assumptions };
}

export interface BlockerImpact {
  taskId: string;
  milestoneId: string;
  /** Milestone slip with the blocker clearing on its recorded expected date (or today if none). */
  slipAsPlanned: number | null;
  expectedClearDate: string | null;
  /** Milestone slip if the blocker clears on the reference date. */
  slipIfClearedNow: number | null;
  /** Additional working days of milestone slip per week (5 working days) the blocker persists. */
  slipPerWeekBlocked: number | null;
  /** Latest working-day offset at which clearing still holds the milestone; null if it cannot be held. */
  latestClearOffset: number | null;
  latestClearDate: string | null;
}

/** Sensitivity of one milestone to how long one blocker persists. Re-runs the forecast; all else unchanged. */
export function blockerImpact(input: ForecastInput, referenceDate: string, taskId: string, milestoneId: string, maxOffset = 15): BlockerImpact {
  const slipAt = (offset: number) =>
    forecast(input, referenceDate, { blockerClearOverrides: new Map([[taskId, offset]]) }).milestones.get(milestoneId)?.slipWorkingDays ?? null;
  const task = input.tasks.find((t) => t.id === taskId);
  const planned = forecast(input, referenceDate).milestones.get(milestoneId)?.slipWorkingDays ?? null;
  const now = slipAt(0);
  const week = slipAt(5);
  let latest: number | null = null;
  if (now !== null && now <= 0) {
    latest = 0;
    for (let o = 1; o <= maxOffset; o++) {
      const s = slipAt(o);
      if (s === null || s > 0) break;
      latest = o;
    }
  }
  return {
    taskId,
    milestoneId,
    slipAsPlanned: planned,
    expectedClearDate: task?.blocked_until ?? null,
    slipIfClearedNow: now,
    slipPerWeekBlocked: now !== null && week !== null ? week - now : null,
    latestClearOffset: latest,
    latestClearDate: latest === null ? null : addWorkingDays(referenceDate, latest),
  };
}
