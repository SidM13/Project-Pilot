import type { Task, TeamMember, Workspace } from "@/lib/types";
import { addWorkingDays, workingDaysInclusive } from "./dates";
import { isOpen, remainingHours } from "./progress";

// Resource load over a fixed look-ahead window of working days.
//
// A task's remaining hours are spread evenly across its working days from
// max(start, reference date) to its due date; only the share that falls inside
// the window counts. Overdue tasks, and tasks with no due date, count in full.

export const LOAD_WINDOW_WORKING_DAYS = 10;
export const OVERLOAD_THRESHOLD_PERCENT = 100;

export interface LoadWindow {
  start: string;
  end: string;
  workingDays: number;
}

export function loadWindow(referenceDate: string, workingDays = LOAD_WINDOW_WORKING_DAYS): LoadWindow {
  const start = addWorkingDays(referenceDate, 0);
  return { start, end: addWorkingDays(start, workingDays - 1), workingDays };
}

export function dailyCapacity(member: TeamMember | undefined, workspace: Workspace): number {
  return (member?.weekly_capacity_hours ?? workspace.default_weekly_capacity) / 5;
}

/** Hours of `task` that fall inside `window`. */
export function hoursInWindow(task: Task, window: LoadWindow): number {
  const hours = remainingHours(task);
  if (hours <= 0) return 0;
  const from = task.start_date && task.start_date > window.start ? task.start_date : window.start;
  if (from > window.end) return 0;
  const to = task.due_date;
  if (!to || to < from) return hours;
  const span = workingDaysInclusive(from, to);
  if (span === 0) return hours;
  const inside = workingDaysInclusive(from, to < window.end ? to : window.end);
  return (hours * inside) / span;
}

export interface MemberLoad {
  memberId: string;
  name: string;
  capacityHours: number;
  assignedHours: number;
  freeHours: number;
  loadPercent: number;
  tasks: { taskId: string; projectId: string; hours: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Load for every active member. `tasks` should already exclude archived/completed projects. */
export function computeLoads(
  tasks: Task[],
  members: TeamMember[],
  workspace: Workspace,
  window: LoadWindow,
): MemberLoad[] {
  return members
    .filter((m) => m.active)
    .map((m) => {
      const capacityHours = dailyCapacity(m, workspace) * window.workingDays;
      const own = tasks
        .filter((t) => isOpen(t) && t.assignee_id === m.id)
        .map((t) => ({ taskId: t.id, projectId: t.project_id, hours: round1(hoursInWindow(t, window)) }))
        .filter((t) => t.hours > 0);
      const assignedHours = round1(own.reduce((s, t) => s + t.hours, 0));
      return {
        memberId: m.id,
        name: m.name,
        capacityHours: round1(capacityHours),
        assignedHours,
        freeHours: round1(capacityHours - assignedHours),
        loadPercent: capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : assignedHours > 0 ? 999 : 0,
        tasks: own,
      };
    });
}
