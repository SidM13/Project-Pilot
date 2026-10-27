import type { WorkspaceSnapshot } from "@/lib/types";
import { formatMoney, formatShortDate } from "@/lib/format";
import { buildGraph, reachable } from "./graph";
import { analyzeWorkspace, getReferenceDate, type WorkspaceAnalysis } from "./index";
import { hourlyRate } from "./cost";
import { isOpen, remainingHours } from "./progress";

// Decision Simulator: apply one proposed change to a deep copy of the snapshot,
// run the same engine on both, and compare. The input snapshot is never mutated
// and nothing is written; applying is a separate, user-approved server action.

export type Scenario =
  | { kind: "reassign"; taskId: string; toMemberId: string }
  | { kind: "deadline"; target: "project" | "milestone"; targetId: string; newDate: string }
  | { kind: "scope"; taskIds: string[] };

export interface PlanMetrics {
  forecastFinish: string | null;
  targetDate: string;
  /** Working days after target (positive = late); null if the finish is unknown. */
  slipWorkingDays: number | null;
  projectedCost: number;
  budget: number;
  budgetVariance: number;
  remainingHours: number;
  tasksAtRisk: number;
  healthScore: number;
  healthStatus: "on_track" | "at_risk" | "critical";
  milestones: { id: string; name: string; due: string; forecast: string | null; slip: number | null }[];
}

export interface PortfolioEffect {
  projectId: string;
  projectName: string;
  before: { finish: string | null; slip: number | null };
  after: { finish: string | null; slip: number | null };
}

export interface SimulationResult {
  projectId: string;
  scenario: Scenario;
  referenceDate: string;
  current: PlanMetrics;
  proposed: PlanMetrics;
  /** Other live projects whose forecast changes (shared people). */
  portfolio: PortfolioEffect[];
  /** Exact record changes that "Apply" would make. */
  changes: string[];
  /** Deadline scenarios: downstream milestones and conflicting dates. */
  affected: string[];
  assumptions: string[];
}

/** Returns an error message if the scenario cannot be simulated against this snapshot. */
export function validateScenario(snapshot: WorkspaceSnapshot, projectId: string, scenario: Scenario): string | null {
  const project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) return "Project not found in this workspace.";
  if (project.archived_at || project.status === "completed") return "Archived or completed projects cannot be simulated.";
  const taskOf = (id: string) => snapshot.tasks.find((t) => t.id === id && t.project_id === projectId);
  switch (scenario.kind) {
    case "reassign": {
      const task = taskOf(scenario.taskId);
      if (!task || !isOpen(task) || task.deferred_at) return "Choose an open task in this project.";
      const member = snapshot.members.find((m) => m.id === scenario.toMemberId);
      if (!member || !member.active) return "Choose an active team member.";
      if (task.assignee_id === member.id) return `${member.name} already owns this task.`;
      return null;
    }
    case "deadline": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scenario.newDate)) return "Pick a new date.";
      if (scenario.target === "project") {
        if (scenario.targetId !== projectId) return "Choose this project's target date.";
        if (scenario.newDate < project.start_date) return "The target cannot be before the project start date.";
        if (scenario.newDate === project.target_date) return "Pick a date different from the current target.";
        return null;
      }
      const m = snapshot.milestones.find((x) => x.id === scenario.targetId && x.project_id === projectId);
      if (!m || m.completed_at) return "Choose an open milestone in this project.";
      if (scenario.newDate === m.due_date) return "Pick a date different from the current due date.";
      return null;
    }
    case "scope": {
      if (!scenario.taskIds.length) return "Select at least one unfinished task to defer.";
      for (const id of scenario.taskIds) {
        const t = taskOf(id);
        if (!t || !isOpen(t) || t.deferred_at) return "Only unfinished tasks in this project can be deferred.";
      }
      return null;
    }
  }
}

/** Pure: a modified deep copy of `snapshot` with the scenario applied. */
export function applyScenario(snapshot: WorkspaceSnapshot, scenario: Scenario, referenceDate: string): WorkspaceSnapshot {
  const copy = structuredClone(snapshot);
  switch (scenario.kind) {
    case "reassign":
      copy.tasks.find((t) => t.id === scenario.taskId)!.assignee_id = scenario.toMemberId;
      break;
    case "deadline":
      if (scenario.target === "project") copy.projects.find((p) => p.id === scenario.targetId)!.target_date = scenario.newDate;
      else copy.milestones.find((m) => m.id === scenario.targetId)!.due_date = scenario.newDate;
      break;
    case "scope":
      for (const t of copy.tasks) if (scenario.taskIds.includes(t.id)) t.deferred_at = `${referenceDate}T00:00:00Z`;
      break;
  }
  return copy;
}

function metrics(analysis: WorkspaceAnalysis, snapshot: WorkspaceSnapshot, projectId: string): PlanMetrics {
  const p = analysis.projects.find((x) => x.project.id === projectId)!;
  const pf = analysis.forecast.projects.get(projectId);
  const atRisk = p.facts.tasks.filter((t) => {
    if (!isOpen(t)) return false;
    const f = analysis.forecast.tasks.get(t.id);
    return t.status === "blocked" || !f?.finish || (!!t.due_date && f.finish > t.due_date);
  }).length;
  return {
    forecastFinish: pf?.finish ?? null,
    targetDate: p.project.target_date,
    slipWorkingDays: pf?.slipWorkingDays ?? null,
    projectedCost: p.cost.estimateAtCompletion,
    budget: p.cost.budget,
    budgetVariance: p.cost.variance,
    remainingHours: p.progress.remainingHours,
    tasksAtRisk: atRisk,
    healthScore: p.health.score,
    healthStatus: p.health.status,
    milestones: snapshot.milestones
      .filter((m) => m.project_id === projectId && !m.completed_at)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((m) => {
        const f = analysis.forecast.milestones.get(m.id);
        return { id: m.id, name: m.name, due: m.due_date, forecast: f?.finish ?? null, slip: f?.slipWorkingDays ?? null };
      }),
  };
}

export function simulate(snapshot: WorkspaceSnapshot, projectId: string, scenario: Scenario, referenceDate = getReferenceDate(snapshot.workspace)): SimulationResult {
  const error = validateScenario(snapshot, projectId, scenario);
  if (error) throw new Error(error);

  const proposedSnapshot = applyScenario(snapshot, scenario, referenceDate);
  const before = analyzeWorkspace(snapshot, referenceDate);
  const after = analyzeWorkspace(proposedSnapshot, referenceDate);
  const members = new Map(snapshot.members.map((m) => [m.id, m]));
  const tasks = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const currency = snapshot.workspace.currency;
  const money = (n: number) => formatMoney(n, currency);

  const portfolio = before.projects
    .filter((p) => p.project.id !== projectId)
    .map((p) => {
      const b = before.forecast.projects.get(p.project.id);
      const a = after.forecast.projects.get(p.project.id);
      return { projectId: p.project.id, projectName: p.project.name, before: { finish: b?.finish ?? null, slip: b?.slipWorkingDays ?? null }, after: { finish: a?.finish ?? null, slip: a?.slipWorkingDays ?? null } };
    })
    .filter((x) => x.before.finish !== x.after.finish);

  const changes: string[] = [];
  const affected: string[] = [];
  const assumptions: string[] = [];

  if (scenario.kind === "reassign") {
    const t = tasks.get(scenario.taskId)!;
    const from = t.assignee_id ? members.get(t.assignee_id) : undefined;
    const to = members.get(scenario.toMemberId)!;
    changes.push(`Task "${t.title}": owner ${from?.name ?? "Unassigned"} → ${to.name}`);
    const rateBefore = hourlyRate(t, members, snapshot.workspace);
    const rateAfter = hourlyRate({ ...t, assignee_id: to.id }, members, snapshot.workspace);
    assumptions.push(
      `${to.name} works at their stated ${to.weekly_capacity_hours} h/week and needs no ramp-up; the remaining estimate (${remainingHours(t)} h) is unchanged.`,
      `Remaining hours are re-costed at ${money(rateAfter)}/h instead of ${money(rateBefore)}/h.`,
    );
    if (from?.discipline && to.discipline && from.discipline !== to.discipline) {
      assumptions.push(`${to.name} (${to.discipline}) is outside the current owner's discipline (${from.discipline}); confirm they can do this work.`);
    }
  } else if (scenario.kind === "deadline") {
    if (scenario.target === "project") {
      const p = snapshot.projects.find((x) => x.id === scenario.targetId)!;
      changes.push(`Project target date: ${formatShortDate(p.target_date)} → ${formatShortDate(scenario.newDate)}`);
      for (const m of snapshot.milestones.filter((x) => x.project_id === projectId && !x.completed_at && x.due_date > scenario.newDate)) {
        affected.push(`Milestone "${m.name}" (due ${formatShortDate(m.due_date)}) would fall after the new target`);
      }
    } else {
      const m = snapshot.milestones.find((x) => x.id === scenario.targetId)!;
      changes.push(`Milestone "${m.name}": due ${formatShortDate(m.due_date)} → ${formatShortDate(scenario.newDate)}`);
      // Downstream: work that depends on this milestone's tasks, and the milestones that work belongs to.
      const graph = buildGraph(snapshot.dependencies.filter((d) => d.project_id === projectId));
      const linked = snapshot.tasks.filter((t) => t.milestone_id === m.id && isOpen(t) && !t.deferred_at);
      const downstream = new Set(linked.flatMap((t) => [...reachable(graph.downstream, t.id)]));
      const downstreamTasks = [...downstream].map((id) => tasks.get(id)!).filter((t) => isOpen(t) && !t.deferred_at && t.milestone_id !== m.id);
      const later = new Set(downstreamTasks.map((t) => t.milestone_id).filter((x): x is string => !!x));
      for (const id of later) {
        const dm = snapshot.milestones.find((x) => x.id === id)!;
        const f = after.forecast.milestones.get(id);
        affected.push(`Downstream milestone "${dm.name}" (due ${formatShortDate(dm.due_date)}) depends on this work; forecast ${formatShortDate(f?.finish)}${f?.slipWorkingDays && f.slipWorkingDays > 0 ? `, ${f.slipWorkingDays} wd late` : ""}`);
      }
      for (const t of downstreamTasks.filter((x) => x.start_date && x.start_date <= scenario.newDate)) {
        affected.push(`"${t.title}" is planned to start ${formatShortDate(t.start_date)}, before the new milestone date`);
      }
      if (!affected.length) affected.push("No other milestones depend on this milestone's work.");
    }
    assumptions.push("Moving a date changes what counts as late; it does not change how long the work takes. Forecast finish dates are unchanged.");
  } else {
    const deferred = scenario.taskIds.map((id) => tasks.get(id)!);
    const hours = deferred.reduce((s, t) => s + remainingHours(t), 0);
    const cost = deferred.reduce((s, t) => s + remainingHours(t) * hourlyRate(t, members, snapshot.workspace), 0);
    for (const t of deferred) changes.push(`Defer "${t.title}" (${remainingHours(t)} h remaining) — kept, but excluded from the plan`);
    const deferredIds = new Set(scenario.taskIds);
    const freed = snapshot.dependencies.filter((d) => deferredIds.has(d.depends_on_id) && !deferredIds.has(d.task_id)).map((d) => tasks.get(d.task_id)!);
    for (const t of freed) affected.push(`"${t.title}" no longer waits on deferred work`);
    assumptions.push(
      `${Math.round(hours)} h of remaining work (${money(cost)} at current rates) leaves the plan; hours already spent stay in actual cost.`,
      "Tasks that depended on deferred work are assumed able to proceed without it.",
      "Deferred work is not re-planned; it can be restored from the Tasks tab.",
    );
  }

  for (const a of after.forecast.assumptions) if (!assumptions.includes(a)) assumptions.push(a);

  return {
    projectId,
    scenario,
    referenceDate,
    current: metrics(before, snapshot, projectId),
    proposed: metrics(after, proposedSnapshot, projectId),
    portfolio,
    changes,
    affected,
    assumptions,
  };
}
