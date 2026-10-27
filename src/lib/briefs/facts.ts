import { analyzeWorkspace, type WorkspaceAnalysis } from "@/lib/engine";
import type { SimulationResult } from "@/lib/engine/simulate";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { WorkspaceSnapshot } from "@/lib/types";

// The calculated half of a decision brief. Built entirely from engine output so it
// can be shown, stored and exported without any AI involvement. It is also the
// only context the AI receives when drafting the narrative.

export interface BriefFacts {
  project: { id: string; name: string; client: string | null; owner: string | null; referenceDate: string; target: string };
  status: {
    healthScore: number;
    healthStatus: string;
    progressPercent: number;
    forecastFinish: string;
    workingDaysLate: number | null;
    budget: string;
    spent: string;
    projectedCost: string;
    budgetVariance: string;
    scheduleVariancePoints: number;
  };
  blockers: { title: string; impact: string | null; evidence: string[] }[];
  decisions: { severity: string; problem: string; impact: string | null; action: string; evidence: string[] }[];
  milestones: { name: string; due: string; forecast: string; workingDaysLate: number | null }[];
  scenario: null | {
    name: string;
    status: "draft" | "applied";
    changes: string[];
    current: { forecastFinish: string; workingDaysLate: number | null; projectedCost: string; tasksAtRisk: number };
    proposed: { forecastFinish: string; workingDaysLate: number | null; projectedCost: string; tasksAtRisk: number };
    assumptions: string[];
  };
}

const EVIDENCE_LIMIT = 4;

export function buildBriefFacts(
  snapshot: WorkspaceSnapshot,
  projectId: string,
  simulation?: { name: string; status: "draft" | "applied"; result: SimulationResult } | null,
  analysis: WorkspaceAnalysis = analyzeWorkspace(snapshot),
): BriefFacts {
  const p = analysis.projects.find((x) => x.project.id === projectId);
  if (!p) throw new Error("Project is not active in this workspace.");
  const money = (n: number) => formatMoney(n, snapshot.workspace.currency);
  const signedMoney = (n: number) => `${n < 0 ? "−" : "+"}${money(Math.abs(n))}`;
  const owner = p.project.owner_member_id ? snapshot.members.find((m) => m.id === p.project.owner_member_id)?.name ?? null : null;
  const pf = analysis.forecast.projects.get(projectId);

  return {
    project: { id: projectId, name: p.project.name, client: p.project.client_name || null, owner, referenceDate: formatShortDate(analysis.referenceDate), target: formatShortDate(p.project.target_date) },
    status: {
      healthScore: p.health.score,
      healthStatus: p.health.status.replace("_", " "),
      progressPercent: p.progress.percent,
      forecastFinish: formatShortDate(pf?.finish),
      workingDaysLate: pf?.slipWorkingDays ?? null,
      budget: money(p.cost.budget),
      spent: money(p.cost.actualCost),
      projectedCost: money(p.cost.estimateAtCompletion),
      budgetVariance: signedMoney(p.cost.variance),
      scheduleVariancePoints: p.schedule.variancePoints,
    },
    blockers: p.findings
      .filter((f) => f.rule === "blocked_task" || f.rule === "overdue_task")
      .map((f) => ({ title: f.title, impact: f.impact?.label ?? null, evidence: f.evidence.slice(0, EVIDENCE_LIMIT).map((e) => e.text) })),
    decisions: analysis.decisions
      .filter((d) => d.projectId === projectId || d.findingIds.some((id) => p.findings.some((f) => f.id === id)))
      .map((d) => ({ severity: d.severity, problem: d.problem, impact: d.impact?.label ?? null, action: d.action, evidence: d.evidence.slice(0, EVIDENCE_LIMIT).map((e) => e.text) })),
    milestones: p.facts.milestones
      .filter((m) => !m.completed_at)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((m) => {
        const f = analysis.forecast.milestones.get(m.id);
        return { name: m.name, due: formatShortDate(m.due_date), forecast: formatShortDate(f?.finish), workingDaysLate: f?.slipWorkingDays ?? null };
      }),
    scenario: simulation
      ? {
          name: simulation.name,
          status: simulation.status,
          changes: simulation.result.changes,
          current: { forecastFinish: formatShortDate(simulation.result.current.forecastFinish), workingDaysLate: simulation.result.current.slipWorkingDays, projectedCost: money(simulation.result.current.projectedCost), tasksAtRisk: simulation.result.current.tasksAtRisk },
          proposed: { forecastFinish: formatShortDate(simulation.result.proposed.forecastFinish), workingDaysLate: simulation.result.proposed.slipWorkingDays, projectedCost: money(simulation.result.proposed.projectedCost), tasksAtRisk: simulation.result.proposed.tasksAtRisk },
          assumptions: simulation.result.assumptions.slice(0, 6),
        }
      : null,
  };
}

/** Plain-text/Markdown rendering used for "Copy" and as the PDF export's source of truth. */
export function briefToMarkdown(title: string, facts: BriefFacts, narrative: Partial<{ executiveSummary: string; recommendation: string; risks: string[]; clientMessage: string }>, aiLabel: string | null) {
  const late = (n: number | null) => (n == null ? "unknown" : n > 0 ? `${n} working days late` : "on time");
  const lines = [
    `# ${title}`,
    `${facts.project.name}${facts.project.client ? ` · ${facts.project.client}` : ""} · as of ${facts.project.referenceDate}`,
    "",
    "## Status (calculated)",
    `- Health ${facts.status.healthScore}/100 (${facts.status.healthStatus}); ${facts.status.progressPercent}% of planned effort complete`,
    `- Forecast finish ${facts.status.forecastFinish} vs target ${facts.project.target} — ${late(facts.status.workingDaysLate)}`,
    `- Budget ${facts.status.budget}; spent ${facts.status.spent}; projected ${facts.status.projectedCost} (variance ${facts.status.budgetVariance})`,
  ];
  if (narrative.executiveSummary) lines.push("", `## Executive summary${aiLabel ? ` (${aiLabel})` : ""}`, narrative.executiveSummary);
  if (facts.decisions.length) {
    lines.push("", "## Decisions required (calculated)");
    facts.decisions.forEach((d) => lines.push(`- **${d.problem}** ${d.impact ?? ""}`.trim(), `  - Recommended action: ${d.action}`, ...d.evidence.map((e) => `  - Evidence: ${e}`)));
  }
  if (facts.scenario) {
    const s = facts.scenario;
    lines.push("", `## Simulated scenario: ${s.name} (${s.status})`, ...s.changes.map((c) => `- ${c}`),
      `- Finish ${s.current.forecastFinish} → ${s.proposed.forecastFinish}; ${late(s.current.workingDaysLate)} → ${late(s.proposed.workingDaysLate)}`,
      `- Projected cost ${s.current.projectedCost} → ${s.proposed.projectedCost}; tasks at risk ${s.current.tasksAtRisk} → ${s.proposed.tasksAtRisk}`);
  }
  if (narrative.recommendation) lines.push("", `## Recommendation${aiLabel ? ` (${aiLabel})` : ""}`, narrative.recommendation);
  if (narrative.risks?.length) lines.push("", `## Risks${aiLabel ? ` (${aiLabel})` : ""}`, ...narrative.risks.map((r) => `- ${r}`));
  if (facts.milestones.length) {
    lines.push("", "## Upcoming milestones (calculated)");
    facts.milestones.forEach((m) => lines.push(`- ${m.name}: due ${m.due}, forecast ${m.forecast} (${late(m.workingDaysLate)})`));
  }
  if (narrative.clientMessage) lines.push("", `## Suggested client message${aiLabel ? ` (${aiLabel})` : ""}`, narrative.clientMessage);
  lines.push("", "Calculated sections are produced by ProjectPilot's documented rules from project records.");
  return lines.join("\n");
}
