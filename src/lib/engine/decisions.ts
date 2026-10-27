import type { Project, Task, TeamMember, Workspace } from "@/lib/types";
import { formatHours, formatMoney, formatShortDate } from "@/lib/format";
import { OVERLOAD_THRESHOLD_PERCENT, type MemberLoad } from "./capacity";
import { SEVERITY_ORDER, type Evidence, type Finding, type Impact, type RuleId, type Severity } from "./findings";
import { remainingHours } from "./progress";

// Decisions Requiring Attention: the subset of findings a manager should act on,
// each with a rule-based recommended action. No AI is involved in choosing the
// action; templates below are deterministic and use only computed values.

export interface Decision {
  id: string;
  rule: RuleId;
  severity: Severity;
  projectId: string;
  projectName: string;
  problem: string;
  impact: Impact | null;
  evidence: Evidence[];
  action: string;
  findingIds: string[];
}

/** A member may receive work only if their load after the move stays at or below this. */
export const REASSIGN_MAX_LOAD_PERCENT = 90;

const RULE_RANK: RuleId[] = [
  "blocked_task",
  "milestone_overdue",
  "resource_overload",
  "milestone_at_risk",
  "budget_overrun",
  "overdue_task",
  "behind_schedule",
  "dependency_wait",
  "budget_headroom",
];

export interface ProjectFindings {
  project: Project;
  tasks: Task[];
  findings: Finding[];
}

export interface Reassignment {
  taskId: string;
  taskTitle: string;
  hours: number;
  fromMemberId: string;
  toMemberId: string;
  toMemberName: string;
}

/**
 * Greedy rebalancing for one overloaded member. Considers their non-blocked work in the
 * load window (not-started before in-progress, larger first) and proposes the first move to
 * a member of the same discipline — preferring people already on that project — whose load
 * stays ≤ REASSIGN_MAX_LOAD_PERCENT afterwards. Mutates `freeHours` so later proposals
 * account for capacity already promised.
 */
export function proposeReassignment(
  load: MemberLoad,
  tasksById: Map<string, Task>,
  members: Map<string, TeamMember>,
  loads: Map<string, MemberLoad>,
  freeHours: Map<string, number>,
  projectTeams: Map<string, Set<string>>,
): Reassignment | null {
  const from = members.get(load.memberId);
  if (!from) return null;
  const options = load.tasks
    .map((x) => ({ ...x, task: tasksById.get(x.taskId)! }))
    .filter((x) => x.task && x.task.status !== "blocked")
    .sort((a, b) => Number(a.task.status !== "todo") - Number(b.task.status !== "todo") || b.hours - a.hours);

  for (const option of options) {
    const team = projectTeams.get(option.projectId) ?? new Set<string>();
    const candidates = [...members.values()]
      .filter((m) => m.active && m.id !== from.id && !!from.discipline && m.discipline === from.discipline)
      .filter((m) => {
        const capacity = loads.get(m.id)?.capacityHours ?? 0;
        const free = freeHours.get(m.id) ?? 0;
        return capacity > 0 && ((capacity - free + option.hours) / capacity) * 100 <= REASSIGN_MAX_LOAD_PERCENT;
      })
      .sort((a, b) => Number(team.has(b.id)) - Number(team.has(a.id)) || (freeHours.get(b.id) ?? 0) - (freeHours.get(a.id) ?? 0));
    const to = candidates[0];
    if (!to) continue;
    freeHours.set(to.id, (freeHours.get(to.id) ?? 0) - option.hours);
    freeHours.set(from.id, (freeHours.get(from.id) ?? 0) + option.hours);
    return { taskId: option.taskId, taskTitle: option.task.title, hours: option.hours, fromMemberId: from.id, toMemberId: to.id, toMemberName: to.name };
  }
  return null;
}

export function buildDecisions(
  projects: ProjectFindings[],
  loads: Map<string, MemberLoad>,
  members: Map<string, TeamMember>,
  workspace: Workspace,
): Decision[] {
  const money = (n: number) => formatMoney(n, workspace.currency);
  const tasksById = new Map(projects.flatMap((p) => p.tasks.map((t) => [t.id, t] as const)));
  const projectById = new Map(projects.map((p) => [p.project.id, p.project]));
  const projectTeams = new Map(
    projects.map((p) => [p.project.id, new Set(p.tasks.flatMap((t) => (t.assignee_id ? [t.assignee_id] : [])))]),
  );
  const freeHours = new Map([...loads.values()].map((l) => [l.memberId, l.freeHours]));
  const all = projects.flatMap((p) => p.findings);
  const consumed = new Set<string>();
  const decisions: Decision[] = [];
  const nameOf = (id: string | null | undefined) => (id ? (members.get(id)?.name ?? "the owner") : "the owner");
  const push = (d: Omit<Decision, "projectName">) =>
    decisions.push({ ...d, projectName: projectById.get(d.projectId)?.name ?? "Unknown project" });

  // 1. Resource overload — one decision per member, worst severity first so the
  //    most urgent rebalancing gets first claim on spare capacity.
  const overloadByMember = new Map<string, Finding[]>();
  for (const f of all.filter((x) => x.rule === "resource_overload")) {
    overloadByMember.set(f.memberIds[0], [...(overloadByMember.get(f.memberIds[0]) ?? []), f]);
  }
  const overloadGroups = [...overloadByMember.entries()]
    .map(([memberId, fs]) => ({ memberId, fs: fs.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)) }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.fs[0].severity) - SEVERITY_ORDER.indexOf(b.fs[0].severity) || (loads.get(b.memberId)!.loadPercent - loads.get(a.memberId)!.loadPercent));

  for (const { memberId, fs } of overloadGroups) {
    const load = loads.get(memberId)!;
    const primary = fs[0];
    // Milestones at risk because this member lacks capacity are the same decision.
    const milestoneRisks = all.filter((f) => f.rule === "milestone_at_risk" && f.meta?.capacityShortfall && f.memberIds.includes(memberId));
    milestoneRisks.forEach((f) => consumed.add(f.id));
    fs.forEach((f) => consumed.add(f.id));

    const move = proposeReassignment(load, tasksById, members, loads, freeHours, projectTeams);
    const deferrable = load.tasks
      .map((x) => tasksById.get(x.taskId)!)
      .filter((t) => t.status === "todo" && !t.is_critical)
      .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))[0];
    const action = move
      ? `Reassign "${move.taskTitle}" (${formatHours(move.hours)} in this window) from ${load.name} to ${move.toMemberName}, who has capacity in the same discipline.`
      : deferrable
        ? `No ${members.get(memberId)?.discipline || "suitable"} team member has spare capacity. Defer "${deferrable.title}" or move its due date, and confirm the trade-off with the client.`
        : `No team member in the same discipline has spare capacity. Re-sequence ${load.name}'s work or add capacity.`;

    push({
      id: `decision:overload:${memberId}`,
      rule: "resource_overload",
      severity: primary.severity,
      // Link to the project whose work the action changes.
      projectId: move ? tasksById.get(move.taskId)!.project_id : (deferrable?.project_id ?? primary.projectId),
      problem: `${load.name} is booked at ${load.loadPercent}% of capacity across ${fs.length === 1 ? "1 project" : `${fs.length} projects`}.`,
      impact: milestoneRisks[0]?.impact ?? primary.impact,
      evidence: [primary.evidence[0], ...fs.flatMap((f) => f.evidence.slice(1)), ...milestoneRisks.flatMap((f) => f.evidence.filter((e) => e.ref?.kind === "member"))],
      action,
      findingIds: [...fs.map((f) => f.id), ...milestoneRisks.map((f) => f.id)],
    });
  }

  for (const f of all) {
    if (consumed.has(f.id)) continue;
    const project = projectById.get(f.projectId)!;
    const client = project.client_name || "the client";
    switch (f.rule) {
      case "blocked_task": {
        if (SEVERITY_ORDER.indexOf(f.severity) > SEVERITY_ORDER.indexOf("high")) break;
        const ownerId = f.meta?.assigneeId as string | null;
        const milestoneName = (f.meta?.milestoneName as string | null) ?? "the milestone";
        const slack = f.meta?.slack as number | null;
        const ownerLoad = ownerId ? loads.get(ownerId) : undefined;
        const parts: string[] = [];
        if (slack === null) parts.push(`Escalate the blocker with ${nameOf(ownerId)} and agree a resolution date.`);
        else if (slack >= 0) parts.push(`Escalate the blocker now; if it cannot clear within ${slack === 0 ? "today" : `${slack} working day${slack === 1 ? "" : "s"}`}, revise the "${milestoneName}" milestone or its dependency on this task.`);
        else parts.push(`Re-baseline "${milestoneName}" — it cannot be met even if the blocker clears today — and escalate the blocker.`);
        if (ownerLoad && ownerLoad.loadPercent > OVERLOAD_THRESHOLD_PERCENT) {
          parts.push(`${ownerLoad.name} is also at ${ownerLoad.loadPercent}% capacity, so the fix will need freed-up time.`);
        }
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action: parts.join(" "), findingIds: [f.id] });
        break;
      }
      case "milestone_overdue":
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action: `Agree a revised date with ${client} and re-plan the ${f.taskIds.length} open task${f.taskIds.length === 1 ? "" : "s"} linked to it.`, findingIds: [f.id] });
        break;
      case "milestone_at_risk":
        if (!f.meta?.capacityShortfall) break;
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action: `Move work off the constrained owner or move the milestone date; confirm with ${client} before ${formatShortDate(projectById.get(f.projectId)!.target_date)}.`, findingIds: [f.id] });
        break;
      case "budget_overrun": {
        const pending = projectsTasks(projects, f.projectId).filter((t) => t.status === "todo" && !t.is_critical);
        const hours = pending.reduce((s, t) => s + remainingHours(t), 0);
        const action = pending.length
          ? `Review the ${pending.length} not-started, non-critical task${pending.length === 1 ? "" : "s"} (${formatHours(hours)}) for deferral, or raise a change request with ${client} for ${money(-f.impact!.value)}.`
          : `Raise a change request with ${client} for ${money(-f.impact!.value)} or reduce scope.`;
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action, findingIds: [f.id] });
        break;
      }
      case "overdue_task":
        if (SEVERITY_ORDER.indexOf(f.severity) > SEVERITY_ORDER.indexOf("high")) break;
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action: `Confirm a recovery date with ${nameOf(f.memberIds[0])} and check the effect on dependent work.`, findingIds: [f.id] });
        break;
      case "behind_schedule":
        if (f.severity !== "high" && f.severity !== "critical") break;
        push({ id: `decision:${f.id}`, rule: f.rule, severity: f.severity, projectId: f.projectId, problem: `${f.title}.`, impact: f.impact, evidence: f.evidence, action: `Re-plan the remaining work against the ${formatShortDate(project.target_date)} target, or agree a later date with ${client}.`, findingIds: [f.id] });
        break;
      default:
        break;
    }
  }

  return decisions.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      RULE_RANK.indexOf(a.rule) - RULE_RANK.indexOf(b.rule) ||
      a.projectName.localeCompare(b.projectName),
  );
}

function projectsTasks(projects: ProjectFindings[], projectId: string) {
  return projects.find((p) => p.project.id === projectId)?.tasks ?? [];
}
