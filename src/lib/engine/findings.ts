import type { BudgetEntry, Milestone, Priority, Project, Task, TaskDependency, TeamMember, Workspace } from "@/lib/types";
import { formatMoney, formatShortDate } from "@/lib/format";
import { addWorkingDays, daysBetween, workingDaysInclusive } from "./dates";
import { buildGraph, reachable, topologicalOrder } from "./graph";
import { dailyCapacity, OVERLOAD_THRESHOLD_PERCENT, type LoadWindow, type MemberLoad } from "./capacity";
import type { CostMetrics } from "./cost";
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
  const durationDays = (t: Task) => Math.ceil(remainingHours(t) / Math.max(0.1, dailyCapacity(t.assignee_id ? members.get(t.assignee_id) : undefined, workspace)));
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
    let impact: Impact | null = null;
    let slack: number | null = null;
    if (affectedMilestone) {
      const chainIds = [t.id, ...downstream.filter((d) => d.milestone_id === affectedMilestone.id).map((d) => d.id)];
      const finish = new Map<string, number>();
      for (const id of topologicalOrder(chainIds, dependencies)) {
        const before = (graph.upstream.get(id) ?? []).filter((u) => finish.has(u)).map((u) => finish.get(u)!);
        finish.set(id, Math.max(0, ...before) + durationDays(byId.get(id)!));
      }
      const chainDays = Math.max(...finish.values());
      const available = workingDaysInclusive(ref, affectedMilestone.due_date);
      slack = available - chainDays;
      evidence.push({
        text: `Feeds milestone "${affectedMilestone.name}" (due ${formatShortDate(affectedMilestone.due_date)}): ${chainDays} working days of dependent work vs ${available} available`,
        ref: { kind: "milestone", id: affectedMilestone.id },
      });
      impact =
        slack >= 0
          ? {
              kind: "schedule",
              value: slack,
              unit: "working_days",
              label: `Must clear by ${formatShortDate(addWorkingDays(ref, slack))} to hold "${affectedMilestone.name}"; each further working day blocked delays it by one day`,
            }
          : {
              kind: "schedule",
              value: slack,
              unit: "working_days",
              label: `"${affectedMilestone.name}" is at least ${plural(-slack, "working day")} late even if unblocked today`,
            };
    }

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
      meta: { assigneeId: t.assignee_id, milestoneId: affectedMilestone?.id ?? null, milestoneName: affectedMilestone?.name ?? null, slack },
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
    if (m.due_date > horizon) continue;

    // (a) capacity: an owner's remaining hours on this milestone exceed their capacity before it is due.
    const available = workingDaysInclusive(ref, m.due_date);
    const hoursByOwner = new Map<string | null, number>();
    for (const t of linked) hoursByOwner.set(t.assignee_id, (hoursByOwner.get(t.assignee_id) ?? 0) + remainingHours(t));
    const short = [...hoursByOwner].flatMap(([ownerId, hours]) => {
      const capacity = dailyCapacity(ownerId ? members.get(ownerId) : undefined, workspace) * available;
      return hours > capacity ? [{ ownerId, hours, capacity }] : [];
    });
    // (b) a linked task is blocked or overdue.
    const troubled = linked.filter((t) => t.status === "blocked" || isOverdue(t, ref));
    if (!short.length && !troubled.length) continue;

    const evidence: Evidence[] = [
      ...short.map((s) => ({
        text: `${memberName(s.ownerId)} has ${Math.round(s.hours)} h of remaining work on this milestone but ${Math.round(s.capacity)} h of capacity before ${formatShortDate(m.due_date)}`,
        ref: s.ownerId ? { kind: "member" as const, id: s.ownerId } : undefined,
      })),
      ...troubled.map((t) => ({ text: `"${t.title}" is ${t.status === "blocked" ? "blocked" : "overdue"}`, ref: { kind: "task" as const, id: t.id } })),
    ];
    const shortfall = short.reduce((s, x) => s + (x.hours - x.capacity), 0);
    findings.push({
      id: `milestone_at_risk:${m.id}`,
      rule: "milestone_at_risk",
      // Capacity shortfalls are new information; blocked/overdue causes already have their own finding.
      severity: short.length ? "high" : "medium",
      projectId: project.id,
      title: `Milestone "${m.name}" (due ${formatShortDate(m.due_date)}) is at risk`,
      evidence,
      impact: short.length
        ? { kind: "capacity", value: Math.round(shortfall), unit: "hours", label: `${Math.round(shortfall)} h more work than capacity before the due date` }
        : null,
      taskIds: [...new Set([...troubled.map((t) => t.id), ...linked.filter((t) => short.some((s) => s.ownerId === t.assignee_id)).map((t) => t.id)])],
      milestoneIds: [m.id],
      memberIds: short.flatMap((s) => (s.ownerId ? [s.ownerId] : [])),
      meta: { capacityShortfall: short.length > 0 },
    });
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
