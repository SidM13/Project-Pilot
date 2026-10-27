import type { BudgetEntry, Milestone, Priority, Project, Task, TaskDependency, TeamMember, Workspace } from "@/lib/types";
import { formatMoney, formatShortDate } from "@/lib/format";
import { addWorkingDays, daysBetween } from "./dates";
import { buildGraph, reachable } from "./graph";
import { OVERLOAD_THRESHOLD_PERCENT, type LoadWindow, type MemberLoad } from "./capacity";
import type { CostMetrics } from "./cost";
import type { BlockerImpact, DateForecast, Forecast } from "./forecast";
import { isOpen, remainingHours, type ScheduleMetrics } from "./progress";

// Calculated findings: each rule below turns database facts into a finding with
// a severity, the evidence it used and (where measurable) its impact.
// Every rule is documented in docs/calculations.md — keep the two in sync.

export type Severity = "critical" | "high" | "medium" | "low";
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export type RuleId =
  | "blocked_task"
  | "dependency_wait"
  | "overdue_task"
  | "milestone_overdue"
  | "milestone_at_risk"
  | "milestone_forecast_late"
  | "project_forecast_late"
  | "behind_schedule"
  | "budget_overrun"
  | "budget_headroom"
  | "resource_overload";

export type FindingCategory = "schedule" | "budget" | "resources";

export const RULE_CATEGORY: Record<RuleId, FindingCategory> = {
  blocked_task: "schedule",
  dependency_wait: "schedule",
  overdue_task: "schedule",
  milestone_overdue: "schedule",
  milestone_at_risk: "schedule",
  milestone_forecast_late: "schedule",
  project_forecast_late: "schedule",
  behind_schedule: "schedule",
  budget_overrun: "budget",
  budget_headroom: "budget",
  resource_overload: "resources",
};

export interface EvidenceRef {
  kind: "task" | "milestone" | "member" | "budget";
  id: string;
}

export interface Evidence {
  text: string;
  ref?: EvidenceRef;
}

export interface Impact {
  kind: "schedule" | "cost" | "capacity";
  /** Signed magnitude in `unit` (e.g. −1 working days of slack, 6240 currency overrun). */
  value: number;
  unit: "working_days" | "currency" | "percent" | "hours";
  label: string;
}

export interface Finding {
  id: string;
  rule: RuleId;
  severity: Severity;
  projectId: string;
  title: string;
  evidence: Evidence[];
  impact: Impact | null;
  taskIds: string[];
  milestoneIds: string[];
  memberIds: string[];
  /** Extra structured data used by decision templates. */
  meta?: Record<string, string | number | boolean | null>;
}

export interface FindingContext {
  referenceDate: string;
  forecast: Forecast;
  blockerImpacts: Map<string, BlockerImpact>;
  workspace: Workspace;
  members: Map<string, TeamMember>;
  loads: Map<string, MemberLoad>;
  window: LoadWindow;
}

export interface ProjectFacts {
  project: Project;
  tasks: Task[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
  budgetEntries: BudgetEntry[];
}

/** Milestones due within this many working days are checked for risk. */
export const MILESTONE_LOOKAHEAD_WORKING_DAYS = 10;
export const BEHIND_SCHEDULE_POINTS = 10;
export const HEADROOM_WARNING_PERCENT = 10;

const PRIORITY_SEVERITY: Record<Priority, Severity> = { low: "low", medium: "medium", high: "high", critical: "critical" };

export function bump(s: Severity, levels = 1): Severity {
  return SEVERITY_ORDER[Math.max(0, SEVERITY_ORDER.indexOf(s) - levels)];
}
export function lower(s: Severity): Severity {
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, SEVERITY_ORDER.indexOf(s) + 1)];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function isOverdue(t: Task, referenceDate: string) {
  return isOpen(t) && !!t.due_date && t.due_date < referenceDate;
}

export function buildFindings(facts: ProjectFacts, ctx: FindingContext, schedule: ScheduleMetrics, cost: CostMetrics): Finding[] {
  const { project, tasks, dependencies, milestones } = facts;
  const { referenceDate: ref, members, workspace } = ctx;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const graph = buildGraph(dependencies.filter((d) => byId.has(d.task_id) && byId.has(d.depends_on_id)));
  const memberName = (id: string | null) => (id ? (members.get(id)?.name ?? "Unknown member") : "Unassigned");
  const openMilestones = milestones.filter((m) => !m.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const findings: Finding[] = [];

  // ── Blocked tasks ────────────────────────────────────────────────────────────
  for (const t of tasks.filter((x) => x.status === "blocked")) {
    const downstream = [...reachable(graph.downstream, t.id)].map((id) => byId.get(id)!).filter(isOpen);
    const waiting = downstream.filter((d) => (graph.upstream.get(d.id) ?? []).includes(t.id) && d.start_date && d.start_date <= ref);
    const affectedMilestone = openMilestones.find((m) => m.id === t.milestone_id || downstream.some((d) => d.milestone_id === m.id));
    const evidence: Evidence[] = [
      { text: `Blocked${t.blocked_reason ? `: ${t.blocked_reason}` : " (no reason recorded)"}`, ref: { kind: "task", id: t.id } },
      { text: `Owner ${memberName(t.assignee_id)} · ${remainingHours(t)} h remaining of ${t.planned_hours} h planned` },
    ];
    if (isOverdue(t, ref)) evidence.push({ text: `Due ${formatShortDate(t.due_date!)} — ${plural(daysBetween(t.due_date!, ref), "day")} overdue` });
    for (const w of waiting) evidence.push({ text: `"${w.title}" was due to start ${formatShortDate(w.start_date!)} and is waiting on it`, ref: { kind: "task", id: w.id } });
    if (downstream.length) evidence.push({ text: `${plural(downstream.length, "downstream task")} cannot finish until it is resolved` });

    // Slack: longest chain (in working days at each owner's capacity) from this task through
    // downstream work of the affected milestone, compared with working days left until it is due.
    // Impact from the capacity forecast: re-run with this blocker clearing later (see forecast.blockerImpact).
    let impact: Impact | null = null;
    const bi = affectedMilestone ? ctx.blockerImpacts.get(t.id) : undefined;
    if (t.blocked_until) evidence.push({ text: `Expected to clear ${formatShortDate(t.blocked_until)} (recorded on the task)` });
    if (affectedMilestone && bi) {
      const name = affectedMilestone.name;
      const mf = ctx.forecast.milestones.get(affectedMilestone.id);
      evidence.push({
        text: `Feeds milestone "${name}", due ${formatShortDate(affectedMilestone.due_date)}; forecast ${mf?.finish ? formatShortDate(mf.finish) : "unknown"}${t.blocked_until ? "" : " assuming it clears today"}`,
        ref: { kind: "milestone", id: affectedMilestone.id },
      });
      if (bi.latestClearDate) evidence.push({ text: `Clearing by ${formatShortDate(bi.latestClearDate)} would still hold "${name}" (forecast re-run)` });
      else if (bi.slipIfClearedNow !== null && bi.slipIfClearedNow > 0) evidence.push({ text: `Even clearing today, "${name}" is forecast ${plural(bi.slipIfClearedNow, "working day")} late` });
      if (bi.slipPerWeekBlocked) evidence.push({ text: `Each further week blocked moves "${name}" by about ${plural(bi.slipPerWeekBlocked, "working day")}` });

      const planned = bi.slipAsPlanned;
      if (planned !== null && planned > 0) {
        impact = {
          kind: "schedule",
          value: -planned,
          unit: "working_days",
          label: t.blocked_until
            ? `"${name}" forecast ${plural(planned, "working day")} late if the blocker clears on ${formatShortDate(t.blocked_until)} as expected`
            : `"${name}" forecast ${plural(planned, "working day")} late even if the blocker clears today`,
        };
      } else if (bi.latestClearDate) {
        impact = { kind: "schedule", value: bi.latestClearOffset ?? 0, unit: "working_days", label: `Must clear by ${formatShortDate(bi.latestClearDate)} to hold "${name}"` };
      }
    }
    // Slack in working days: negative = forecast slip, otherwise days of clearance margin.
    const slack = bi?.slipAsPlanned != null && bi.slipAsPlanned > 0 ? -bi.slipAsPlanned : (bi?.latestClearOffset ?? null);

    let severity = PRIORITY_SEVERITY[t.priority];
    if (t.is_critical || (slack !== null && slack <= 2) || downstream.length >= 3) severity = bump(severity);
    findings.push({
      id: `blocked_task:${t.id}`,
      rule: "blocked_task",
      severity,
      projectId: project.id,
      title: `"${t.title}" is blocked`,
      evidence,
      impact,
      taskIds: [t.id, ...waiting.map((w) => w.id)],
      milestoneIds: affectedMilestone ? [affectedMilestone.id] : [],
      memberIds: t.assignee_id ? [t.assignee_id] : [],
      meta: { assigneeId: t.assignee_id, milestoneId: affectedMilestone?.id ?? null, milestoneName: affectedMilestone?.name ?? null, slack, latestClearDate: bi?.latestClearDate ?? null },
    });
  }

  // ── Overdue tasks (blocked tasks are already covered above) ─────────────────
  for (const t of tasks.filter((x) => isOverdue(x, ref) && x.status !== "blocked")) {
    const daysLate = daysBetween(t.due_date!, ref);
    const base = t.priority === "critical" ? "high" : PRIORITY_SEVERITY[t.priority];
    findings.push({
      id: `overdue_task:${t.id}`,
      rule: "overdue_task",
      severity: daysLate >= 7 || t.is_critical ? bump(base) : base,
      projectId: project.id,
      title: `"${t.title}" is ${plural(daysLate, "day")} overdue`,
      evidence: [
        { text: `Due ${formatShortDate(t.due_date!)} · status ${t.status.replace("_", " ")}`, ref: { kind: "task", id: t.id } },
        { text: `Owner ${memberName(t.assignee_id)} · ${remainingHours(t)} h remaining` },
      ],
      impact: { kind: "schedule", value: -daysLate, unit: "working_days", label: `${plural(daysLate, "day")} past due` },
      taskIds: [t.id],
      milestoneIds: t.milestone_id ? [t.milestone_id] : [],
      memberIds: t.assignee_id ? [t.assignee_id] : [],
    });
  }

  // ── Work waiting on overdue (not blocked) upstream tasks ────────────────────
  for (const t of tasks.filter((x) => isOpen(x) && x.status !== "blocked" && (x.status === "in_progress" || (!!x.start_date && x.start_date <= ref)))) {
    const late = (graph.upstream.get(t.id) ?? []).map((id) => byId.get(id)!).filter((u) => u.status !== "blocked" && isOverdue(u, ref));
    if (!late.length) continue;
    findings.push({
      id: `dependency_wait:${t.id}`,
      rule: "dependency_wait",
      severity: lower(PRIORITY_SEVERITY[t.priority]),
      projectId: project.id,
      title: `"${t.title}" is waiting on overdue work`,
      evidence: late.map((u) => ({ text: `Depends on "${u.title}", due ${formatShortDate(u.due_date!)}`, ref: { kind: "task" as const, id: u.id } })),
      impact: null,
      taskIds: [t.id, ...late.map((u) => u.id)],
      milestoneIds: [],
      memberIds: [],
    });
  }

  // ── Milestones ───────────────────────────────────────────────────────────────
  const horizon = addWorkingDays(ref, MILESTONE_LOOKAHEAD_WORKING_DAYS - 1);
  for (const m of openMilestones) {
    const linked = tasks.filter((t) => t.milestone_id === m.id && isOpen(t));
    if (m.due_date < ref) {
      findings.push({
        id: `milestone_overdue:${m.id}`,
        rule: "milestone_overdue",
        severity: "high",
        projectId: project.id,
        title: `Milestone "${m.name}" missed by ${plural(daysBetween(m.due_date, ref), "day")}`,
        evidence: [
          { text: `Was due ${formatShortDate(m.due_date)}`, ref: { kind: "milestone", id: m.id } },
          { text: `${plural(linked.length, "linked task")} still open` },
        ],
        impact: { kind: "schedule", value: -daysBetween(m.due_date, ref), unit: "working_days", label: `${plural(daysBetween(m.due_date, ref), "day")} late` },
        taskIds: linked.map((t) => t.id),
        milestoneIds: [m.id],
        memberIds: [],
      });
      continue;
    }
    // (a) capacity forecast says the milestone finishes after its due date (any horizon).
    const mf = ctx.forecast.milestones.get(m.id);
    if (mf?.slipWorkingDays != null && mf.slipWorkingDays > 0) {
      findings.push(lateFinding({ kind: "milestone", id: m.id, name: m.name }, mf, project.id, ctx, byId, graph, memberName));
      continue;
    }
    // (b) forecast holds, but linked work due soon is blocked or overdue.
    if (m.due_date > horizon) continue;
    const troubled = linked.filter((t) => t.status === "blocked" || isOverdue(t, ref));
    if (!troubled.length) continue;
    findings.push({
      id: `milestone_at_risk:${m.id}`,
      rule: "milestone_at_risk",
      severity: "medium",
      projectId: project.id,
      title: `Milestone "${m.name}" (due ${formatShortDate(m.due_date)}) depends on troubled work`,
      evidence: [
        { text: `Forecast holds the date${mf?.finish ? ` (${formatShortDate(mf.finish)})` : ""} only if the issues below clear`, ref: { kind: "milestone", id: m.id } },
        ...troubled.map((t) => ({ text: `"${t.title}" is ${t.status === "blocked" ? "blocked" : "overdue"}`, ref: { kind: "task" as const, id: t.id } })),
      ],
      impact: null,
      taskIds: troubled.map((t) => t.id),
      milestoneIds: [m.id],
      memberIds: [],
    });
  }

  // ── Project finish forecast ─────────────────────────────────────────────────
  const pf = ctx.forecast.projects.get(project.id);
  if (pf?.slipWorkingDays != null && pf.slipWorkingDays > 0) {
    findings.push(lateFinding({ kind: "project", id: project.id, name: project.name }, pf, project.id, ctx, byId, graph, memberName));
  }

  // ── Schedule variance ───────────────────────────────────────────────────────
  if (schedule.started && schedule.variancePoints < -BEHIND_SCHEDULE_POINTS) {
    findings.push({
      id: `behind_schedule:${project.id}`,
      rule: "behind_schedule",
      severity: schedule.variancePoints < -25 ? "high" : "medium",
      projectId: project.id,
      title: `${Math.abs(schedule.variancePoints)} points behind planned progress`,
      evidence: [
        { text: `${schedule.actualPercent}% of planned effort complete vs ${schedule.expectedPercent}% of the schedule elapsed (${schedule.elapsedDays} of ${schedule.totalDays} days)` },
      ],
      impact: { kind: "schedule", value: schedule.variancePoints, unit: "percent", label: `${schedule.variancePoints} pts schedule variance` },
      taskIds: [],
      milestoneIds: [],
      memberIds: [],
    });
  }

  // ── Budget ──────────────────────────────────────────────────────────────────
  if (cost.budget > 0) {
    const costEvidence: Evidence[] = [
      { text: `Budget ${formatMoney(cost.budget, workspace.currency)} · spent ${formatMoney(cost.actualCost, workspace.currency)} (${cost.burnPercent}%)`, ref: { kind: "budget", id: project.id } },
      { text: `Remaining work costed at ${formatMoney(cost.estimateToComplete, workspace.currency)} → forecast ${formatMoney(cost.estimateAtCompletion, workspace.currency)} at completion` },
    ];
    if (cost.defaultRateTaskIds.length) {
      costEvidence.push({ text: `${plural(cost.defaultRateTaskIds.length, "task")} costed at the workspace default rate (${formatMoney(workspace.default_hourly_rate, workspace.currency)}/h)` });
    }
    if (cost.variance < 0) {
      const overrunPct = -(cost.variancePercent ?? 0);
      findings.push({
        id: `budget_overrun:${project.id}`,
        rule: "budget_overrun",
        severity: overrunPct >= 10 ? "critical" : overrunPct >= 3 ? "high" : "medium",
        projectId: project.id,
        title: `Forecast to finish ${formatMoney(-cost.variance, workspace.currency)} over budget`,
        evidence: costEvidence,
        impact: { kind: "cost", value: cost.variance, unit: "currency", label: `${formatMoney(-cost.variance, workspace.currency)} (${overrunPct}%) forecast overrun` },
        taskIds: [],
        milestoneIds: [],
        memberIds: [],
      });
    } else if ((cost.variancePercent ?? 100) < HEADROOM_WARNING_PERCENT) {
      findings.push({
        id: `budget_headroom:${project.id}`,
        rule: "budget_headroom",
        severity: "low",
        projectId: project.id,
        title: `Only ${formatMoney(cost.variance, workspace.currency)} of budget headroom left`,
        evidence: costEvidence,
        impact: { kind: "cost", value: cost.variance, unit: "currency", label: `${cost.variancePercent}% headroom at completion` },
        taskIds: [],
        milestoneIds: [],
        memberIds: [],
      });
    }
  }

  // ── Resource overload (members with work on this project in the load window) ─
  for (const load of ctx.loads.values()) {
    if (load.loadPercent <= OVERLOAD_THRESHOLD_PERCENT) continue;
    const here = load.tasks.filter((x) => x.projectId === project.id);
    if (!here.length) continue;
    const hasCriticalHere = here.some((x) => byId.get(x.taskId)?.is_critical);
    const base: Severity = load.loadPercent >= 130 ? "high" : "medium";
    findings.push({
      id: `resource_overload:${project.id}:${load.memberId}`,
      rule: "resource_overload",
      severity: hasCriticalHere ? base : lower(base),
      projectId: project.id,
      title: `${load.name} is at ${load.loadPercent}% of capacity`,
      evidence: [
        {
          text: `${load.assignedHours} h assigned vs ${load.capacityHours} h available, ${formatShortDate(ctx.window.start)}–${formatShortDate(ctx.window.end)} (${ctx.window.workingDays} working days)`,
          ref: { kind: "member", id: load.memberId },
        },
        ...here.map((x) => ({ text: `"${byId.get(x.taskId)!.title}": ${x.hours} h in window`, ref: { kind: "task" as const, id: x.taskId } })),
      ],
      impact: { kind: "capacity", value: Math.round(-load.freeHours), unit: "hours", label: `${Math.round(-load.freeHours)} h over capacity` },
      taskIds: here.map((x) => x.taskId),
      milestoneIds: [],
      memberIds: [load.memberId],
    });
  }

  return findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

export function slipSeverity(slip: number): Severity {
  return slip >= 10 ? "critical" : slip >= 5 ? "high" : "medium";
}

/** A forecast-late milestone or project, explained by the task that finishes last and why it is late. */
function lateFinding(
  target: { kind: "milestone" | "project"; id: string; name: string },
  f: DateForecast,
  projectId: string,
  ctx: FindingContext,
  byId: Map<string, Task>,
  graph: ReturnType<typeof buildGraph>,
  memberName: (id: string | null) => string,
): Finding {
  const slip = f.slipWorkingDays!;
  const driving = f.drivingTaskId ? byId.get(f.drivingTaskId) : undefined;
  const tf = driving ? ctx.forecast.tasks.get(driving.id) : undefined;
  const ownerLoad = driving?.assignee_id ? ctx.loads.get(driving.assignee_id) : undefined;
  const waitsOn = driving
    ? (graph.upstream.get(driving.id) ?? [])
        .map((id) => byId.get(id))
        .filter((u): u is Task => !!u && isOpen(u))
        .sort((a, b) => (ctx.forecast.tasks.get(b.id)?.finish ?? "").localeCompare(ctx.forecast.tasks.get(a.id)?.finish ?? ""))
    : [];
  const ownerConstrained = !!ownerLoad && ownerLoad.loadPercent > OVERLOAD_THRESHOLD_PERCENT;
  const label = target.kind === "milestone" ? `Milestone "${target.name}"` : "Project finish";
  const evidence: Evidence[] = [
    {
      text: `${label}: due ${formatShortDate(f.due)}, forecast ${formatShortDate(f.finish)} — ${plural(slip, "working day")} late`,
      ref: target.kind === "milestone" ? { kind: "milestone", id: target.id } : undefined,
    },
  ];
  if (driving && tf) {
    evidence.push({
      text: `Last to finish: "${driving.title}" (${memberName(driving.assignee_id)}, ${remainingHours(driving)} h left), forecast ${formatShortDate(tf.start)}–${formatShortDate(tf.finish)}`,
      ref: { kind: "task", id: driving.id },
    });
    if (waitsOn[0]) {
      const uf = ctx.forecast.tasks.get(waitsOn[0].id);
      evidence.push({ text: `It cannot start until "${waitsOn[0].title}" finishes (forecast ${formatShortDate(uf?.finish)})`, ref: { kind: "task", id: waitsOn[0].id } });
    }
    if (ownerConstrained) evidence.push({ text: `${ownerLoad!.name} is at ${ownerLoad!.loadPercent}% of capacity over the next ${ctx.window.workingDays} working days`, ref: { kind: "member", id: ownerLoad!.memberId } });
  }
  return {
    id: `${target.kind}_forecast_late:${target.id}`,
    rule: target.kind === "milestone" ? "milestone_forecast_late" : "project_forecast_late",
    severity: slipSeverity(slip),
    projectId,
    title: target.kind === "milestone" ? `Milestone "${target.name}" is forecast ${plural(slip, "working day")} late` : `Project is forecast to finish ${plural(slip, "working day")} after its target`,
    evidence,
    impact: { kind: "schedule", value: -slip, unit: "working_days", label: `Forecast ${formatShortDate(f.finish)} vs due ${formatShortDate(f.due)} (${plural(slip, "working day")} late)` },
    taskIds: driving ? [driving.id, ...waitsOn.map((u) => u.id)] : [],
    milestoneIds: target.kind === "milestone" ? [target.id] : [],
    memberIds: driving?.assignee_id ? [driving.assignee_id] : [],
    // True when a blocked task sits anywhere upstream of the driving task: the slip is the blocker's knock-on effect.
    meta: { targetName: target.name, drivingTaskId: driving?.id ?? null, ownerConstrained, blockedUpstream: !!driving && [driving.id, ...reachable(graph.upstream, driving.id)].some((id) => byId.get(id)?.status === "blocked") },
  };
}
