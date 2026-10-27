import type { Milestone, Project, Task, WorkspaceSnapshot } from "@/lib/types";
import { addDays, todayISO } from "./dates";
import { computeLoads, loadWindow, type LoadWindow, type MemberLoad } from "./capacity";
import { computeCost, type CostMetrics } from "./cost";
import { blockerImpact, forecast, type DateForecast, type Forecast, type ForecastInput } from "./forecast";
import { buildGraph, reachable } from "./graph";
import { buildDecisions, type Decision } from "./decisions";
import { buildFindings, type Finding, type ProjectFacts } from "./findings";
import { computeHealth, type HealthResult } from "./health";
import { computeProgress, computeSchedule, isOpen, type ProgressMetrics, type ScheduleMetrics } from "./progress";

// Single entry point: (snapshot, reference date) → every calculated value the UI shows.
// Pure and synchronous — no I/O, no clock reads except through referenceDate.

export const CRITICAL_DEADLINE_DAYS = 14;

export interface ProjectAnalysis {
  project: Project;
  /** Capacity forecast of the project's finish (null fields when nothing is open). */
  forecastFinish: DateForecast | null;
  facts: ProjectFacts;
  progress: ProgressMetrics;
  schedule: ScheduleMetrics;
  cost: CostMetrics;
  findings: Finding[];
  health: HealthResult;
}

export interface Deadline {
  kind: "milestone" | "task";
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  atRisk: boolean;
}

export interface WorkspaceAnalysis {
  referenceDate: string;
  forecast: Forecast;
  window: LoadWindow;
  projects: ProjectAnalysis[];
  loads: MemberLoad[];
  decisions: Decision[];
  deadlines: Deadline[];
  metrics: {
    activeProjects: number;
    needingIntervention: number;
    overdueMilestones: number;
    /** Σ forecast overrun (EAC − budget) across projects that are over. */
    budgetExposure: number;
    criticalDeadlines: number;
  };
}

/** The pinned demo date when set, otherwise today (UTC). */
export function getReferenceDate(workspace: { reference_date: string | null }): string {
  return workspace.reference_date ?? todayISO();
}

/** Projects the engine evaluates: not archived and not completed. */
export function isLiveProject(p: Project) {
  return !p.archived_at && p.status !== "completed";
}

export function analyzeWorkspace(snapshot: WorkspaceSnapshot, referenceDate = getReferenceDate(snapshot.workspace)): WorkspaceAnalysis {
  const { workspace } = snapshot;
  const live = snapshot.projects.filter(isLiveProject);
  const liveIds = new Set(live.map((p) => p.id));
  const liveTasks = snapshot.tasks.filter((t) => liveIds.has(t.project_id) && !t.deferred_at);
  const members = new Map(snapshot.members.map((m) => [m.id, m]));
  const window = loadWindow(referenceDate);
  const loads = computeLoads(liveTasks, snapshot.members, workspace, window);
  const loadMap = new Map(loads.map((l) => [l.memberId, l]));
  const forecastInput = {
    workspace,
    members: snapshot.members,
    projects: live,
    milestones: snapshot.milestones.filter((m) => liveIds.has(m.project_id)),
    tasks: liveTasks,
    dependencies: snapshot.dependencies.filter((d) => liveIds.has(d.project_id)),
  };
  const plan = forecast(forecastInput, referenceDate);
  const blockerImpacts = new Map(
    liveTasks
      .filter((t) => t.status === "blocked")
      .flatMap((t) => {
        const milestoneId = affectedMilestoneId(t, forecastInput);
        return milestoneId ? [[t.id, blockerImpact(forecastInput, referenceDate, t.id, milestoneId)] as const] : [];
      }),
  );
  const ctx = { referenceDate, workspace, members, loads: loadMap, window, forecast: plan, blockerImpacts };

  const projects = live.map((project): ProjectAnalysis => {
    const facts: ProjectFacts = {
      project,
      tasks: liveTasks.filter((t) => t.project_id === project.id),
      dependencies: snapshot.dependencies.filter((d) => d.project_id === project.id),
      milestones: snapshot.milestones.filter((m) => m.project_id === project.id),
      budgetEntries: snapshot.budgetEntries.filter((e) => e.project_id === project.id),
    };
    const progress = computeProgress(facts.tasks);
    const schedule = computeSchedule(project, progress, referenceDate);
    const cost = computeCost(project, facts.tasks, facts.budgetEntries, members, workspace);
    const findings = buildFindings(facts, ctx, schedule, cost);
    return { project, forecastFinish: plan.projects.get(project.id) ?? null, facts, progress, schedule, cost, findings, health: computeHealth(findings) };
  });

  const decisions = buildDecisions(
    projects.map((p) => ({ project: p.project, tasks: p.facts.tasks, findings: p.findings })),
    loadMap,
    members,
    workspace,
  );

  const deadlines = upcomingDeadlines(projects, referenceDate);
  const overdueMilestones = projects.reduce((n, p) => n + p.findings.filter((f) => f.rule === "milestone_overdue").length, 0);

  return {
    referenceDate,
    forecast: plan,
    window,
    projects,
    loads,
    decisions,
    deadlines,
    metrics: {
      activeProjects: live.length,
      needingIntervention: projects.filter((p) => p.health.status !== "on_track").length,
      overdueMilestones,
      budgetExposure: projects.reduce((s, p) => s + Math.max(0, -p.cost.variance), 0),
      criticalDeadlines: deadlines.length,
    },
  };
}

/**
 * Analysis for one project. Live projects come from the workspace analysis; an archived or
 * completed project is evaluated as if it were live so its page can still show figures
 * (it remains excluded from portfolio metrics and team load).
 */
export function analyzeProject(snapshot: WorkspaceSnapshot, projectId: string, referenceDate = getReferenceDate(snapshot.workspace)): ProjectAnalysis | null {
  const project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const view = isLiveProject(project)
    ? snapshot
    : { ...snapshot, projects: snapshot.projects.map((p) => (p.id === projectId ? { ...p, archived_at: null, status: "active" as const } : p)) };
  const analysis = analyzeWorkspace(view, referenceDate).projects.find((p) => p.project.id === projectId)!;
  return { ...analysis, project };
}

/** The earliest-due open milestone that a blocked task (or anything downstream of it) belongs to. */
function affectedMilestoneId(task: Task, input: ForecastInput): string | null {
  const downstream = reachable(buildGraph(input.dependencies).downstream, task.id);
  const ids = new Set([task.milestone_id, ...input.tasks.filter((t) => downstream.has(t.id)).map((t) => t.milestone_id)]);
  const m = input.milestones.filter((x) => !x.completed_at && ids.has(x.id)).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return m?.id ?? null;
}

/** Open milestones and open critical tasks due within CRITICAL_DEADLINE_DAYS of the reference date. */
function upcomingDeadlines(projects: ProjectAnalysis[], ref: string): Deadline[] {
  const until = addDays(ref, CRITICAL_DEADLINE_DAYS);
  const inRange = (d: string | null): d is string => !!d && d >= ref && d <= until;
  const out: Deadline[] = [];
  for (const p of projects) {
    const riskyMilestones = new Set(p.findings.filter((f) => f.rule === "milestone_at_risk" || f.rule === "milestone_forecast_late" || f.rule === "blocked_task").flatMap((f) => f.milestoneIds));
    const riskyTasks = new Set(p.findings.flatMap((f) => f.taskIds));
    p.facts.milestones
      .filter((m: Milestone) => !m.completed_at && inRange(m.due_date))
      .forEach((m) => out.push({ kind: "milestone", id: m.id, projectId: p.project.id, title: m.name, dueDate: m.due_date, atRisk: riskyMilestones.has(m.id) }));
    p.facts.tasks
      .filter((t: Task) => isOpen(t) && t.is_critical && inRange(t.due_date))
      .forEach((t) => out.push({ kind: "task", id: t.id, projectId: p.project.id, title: t.title, dueDate: t.due_date!, atRisk: riskyTasks.has(t.id) }));
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || Number(b.atRisk) - Number(a.atRisk));
}

export type { Decision } from "./decisions";
export type { Finding, Severity, Evidence, Impact } from "./findings";
export type { HealthStatus } from "./health";
export type { MemberLoad } from "./capacity";
export type { Forecast, TaskForecast, DateForecast } from "./forecast";
