import type { Project, Task, TaskStatus } from "@/lib/types";
import { daysBetween } from "./dates";

// Effort-based progress. A task "earns" the hours that are no longer remaining,
// so a 40 h task with 10 h left contributes 30 h of progress.

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Hours left on a task: 0 when done, the owner's estimate if given, else planned − actual (≥ 0). */
export function remainingHours(t: Task): number {
  if (t.status === "done") return 0;
  return t.remaining_hours ?? Math.max(t.planned_hours - t.actual_hours, 0);
}

export function earnedHours(t: Task): number {
  if (t.status === "done") return t.planned_hours;
  return Math.min(t.planned_hours, Math.max(0, t.planned_hours - remainingHours(t)));
}

export const isOpen = (t: Task) => t.status !== "done";

export interface ProgressMetrics {
  percent: number;
  plannedHours: number;
  earnedHours: number;
  remainingHours: number;
  actualHours: number;
  totalTasks: number;
  doneTasks: number;
  byStatus: Record<TaskStatus, number>;
}

export function computeProgress(tasks: Task[]): ProgressMetrics {
  const byStatus: Record<TaskStatus, number> = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  let planned = 0;
  let earned = 0;
  let remaining = 0;
  let actual = 0;
  for (const t of tasks) {
    byStatus[t.status] += 1;
    planned += t.planned_hours;
    earned += earnedHours(t);
    remaining += remainingHours(t);
    actual += t.actual_hours;
  }
  return {
    percent: planned > 0 ? Math.round((earned / planned) * 100) : 0,
    plannedHours: round1(planned),
    earnedHours: round1(earned),
    remainingHours: round1(remaining),
    actualHours: round1(actual),
    totalTasks: tasks.length,
    doneTasks: byStatus.done,
    byStatus,
  };
}

export interface ScheduleMetrics {
  started: boolean;
  elapsedDays: number;
  totalDays: number;
  daysRemaining: number;
  /** Share of the planned duration that has elapsed (time-linear baseline). */
  expectedPercent: number;
  actualPercent: number;
  /** actual − expected, in percentage points (negative = behind). */
  variancePoints: number;
}

export function computeSchedule(project: Project, progress: ProgressMetrics, referenceDate: string): ScheduleMetrics {
  const totalDays = Math.max(0, daysBetween(project.start_date, project.target_date));
  const sinceStart = daysBetween(project.start_date, referenceDate);
  const started = sinceStart >= 0 && project.status !== "planning";
  const elapsedDays = Math.max(0, Math.min(sinceStart, totalDays));
  const expectedPercent = !started ? 0 : totalDays === 0 ? 100 : Math.round((elapsedDays / totalDays) * 100);
  return {
    started,
    elapsedDays,
    totalDays,
    daysRemaining: daysBetween(referenceDate, project.target_date),
    expectedPercent,
    actualPercent: progress.percent,
    variancePoints: started ? progress.percent - expectedPercent : 0,
  };
}
