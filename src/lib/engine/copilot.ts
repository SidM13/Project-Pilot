import type { Milestone, Project, Task, WorkspaceSnapshot } from "@/lib/types";
import { formatHours, formatMoney, formatShortDate } from "@/lib/format";
import { addWorkingDays, workingDaysInclusive } from "./dates";
import { buildGraph, reachable } from "./graph";
import { analyzeWorkspace, getReferenceDate, type ProjectAnalysis, type WorkspaceAnalysis } from "./index";
import { hourlyRate } from "./cost";
import { OVERLOAD_THRESHOLD_PERCENT } from "./capacity";
import { workingDaysDiff } from "./forecast";
import { computeAgile, criticalPath } from "./planning";
import { isOpen, remainingHours } from "./progress";

// AI Copilot, deterministic half. A question is classified into one of a fixed set of
// intents; each intent is answered by the engine from the records. The answer keeps
// three layers apart — facts (records), forecasts (engine calculations), assumptions —
// plus rule-based recommendations. The language model only ever explains this answer.

export const COPILOT_INTENTS = ["at_risk", "budget", "priorities", "overloaded", "cost_reduction", "delay", "weekly_summary"] as const;
export type CopilotIntent = (typeof COPILOT_INTENTS)[number];

/** Tasks due within this many working days count as "this week" for prioritisation. */
export const PRIORITY_WINDOW_WORKING_DAYS = 5;
export const PRIORITY_LIST_SIZE = 6;

export interface CopilotQuery {
  intent: CopilotIntent;
  projectId?: string;
  milestoneId?: string;
  /** Working days of delay (delay intent). */
  days?: number;
}

export type Tone = "critical" | "warning" | "healthy" | "neutral";

export interface CopilotLine {
  text: string;
  tone?: Tone;
  projectId?: string;
}

export interface CopilotAnswer {
  query: CopilotQuery;
  title: string;
  /** One-sentence deterministic headline (shown when AI is off). */
  headline: string;
  facts: CopilotLine[];
  forecasts: CopilotLine[];
  assumptions: string[];
  recommendations: CopilotLine[];
  referenceDate: string;
}

export const SUGGESTED_QUESTIONS: { label: string; query: Omit<CopilotQuery, "projectId" | "milestoneId">; needs?: "project" | "milestone" }[] = [
  { label: "Which projects are at risk of missing their deadlines?", query: { intent: "at_risk" } },
  { label: "Can we complete this project within the remaining budget?", query: { intent: "budget" }, needs: "project" },
  { label: "Which tasks should I prioritize this week?", query: { intent: "priorities" } },
  { label: "Which team members are overloaded?", query: { intent: "overloaded" } },
  { label: "How can I reduce costs without affecting critical deliverables?", query: { intent: "cost_reduction" } },
  { label: "What happens if a milestone is delayed by five days?", query: { intent: "delay", days: 5 }, needs: "milestone" },
  { label: "Generate a weekly executive project summary", query: { intent: "weekly_summary" } },
];

// ── Classification ──────────────────────────────────────────────────────────

const RULES: [CopilotIntent, RegExp][] = [
  ["delay", /\b(delay(ed|s)?|slip(s|ped)?|push(ed)? back|late by|what happens if|what if)\b/i],
  ["weekly_summary", /\b(summary|summari[sz]e|executive|status report|weekly report|update for)\b/i],
  ["cost_reduction", /\b(reduce|cut|lower|save|saving|savings|cheaper)\b.*\b(cost|costs|spend|budget|money)\b|\b(cost|costs)\b.*\b(reduc|cut|sav)/i],
  ["budget", /\b(budget|afford|money|spend|spending|cost|overrun|within)\b/i],
  ["overloaded", /\b(overload(ed)?|overallocat(ed|ion)|over capacity|too much work|burn(ing)? out|capacity|workload|busy)\b/i],
  ["priorities", /\b(priorit(y|ize|ise|ies)|focus|first|this week|today|next|should i work)\b/i],
  ["at_risk", /\b(risk|at risk|late|behind|miss(ing)?|deadline|on track|trouble|danger)\b/i],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
const STOP = new Set(["the", "and", "for", "project", "client", "implementation", "migration", "improvement", "process", "with", "complete"]);

function bestMatch<T>(question: string, items: T[], names: (item: T) => string[]): T | undefined {
  const q = ` ${norm(question)} `;
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    let score = 0;
    for (const name of names(item)) {
      const n = norm(name).trim();
      if (n && q.includes(` ${n} `)) score += 10;
      for (const w of n.split(/\s+/)) if (w.length > 2 && !STOP.has(w) && q.includes(` ${w} `)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Parses a delay length in working days ("5 days", "five days", "a week", "2 weeks"). */
export function parseDays(question: string): number | undefined {
  const q = question.toLowerCase();
  const m = q.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a)\s*(working\s*|business\s*)?(day|days|week|weeks)\b/);
  if (!m) return undefined;
  const n = m[1] === "a" ? 1 : (NUMBER_WORDS[m[1]] ?? Number(m[1]));
  const days = m[3].startsWith("week") ? n * 5 : n;
  return days > 0 && days <= 120 ? days : undefined;
}

/** Maps free text to an intent and, when named, a project / milestone / delay length. Null when unrecognised. */
export function classifyQuestion(question: string, snapshot: WorkspaceSnapshot): CopilotQuery | null {
  const rule = RULES.find(([, re]) => re.test(question));
  if (!rule) return null;
  const live = snapshot.projects.filter((p) => !p.archived_at && p.status !== "completed");
  const project = bestMatch(question, live, (p) => [p.name, p.client_name]);
  const milestones = snapshot.milestones.filter((m) => !m.completed_at && live.some((p) => p.id === m.project_id) && (!project || m.project_id === project.id));
  const milestone = bestMatch(question, milestones, (m) => [m.name]);
  const intent = rule[0];
  return {
    intent,
    ...(project ? { projectId: project.id } : milestone ? { projectId: milestone.project_id } : {}),
    ...(milestone ? { milestoneId: milestone.id } : {}),
    ...(intent === "delay" ? { days: parseDays(question) ?? 5 } : {}),
  };
}

// ── Answers ─────────────────────────────────────────────────────────────────

const slipText = (slip: number | null) => (slip === null ? "finish date unknown" : slip > 0 ? `${slip} working days late` : slip < 0 ? `${-slip} working days early` : "on the due date");

function healthTone(p: ProjectAnalysis): Tone {
  return p.health.status === "critical" ? "critical" : p.health.status === "at_risk" ? "warning" : "healthy";
}

export function answerQuery(snapshot: WorkspaceSnapshot, query: CopilotQuery, referenceDate = getReferenceDate(snapshot.workspace)): CopilotAnswer {
  const analysis = analyzeWorkspace(snapshot, referenceDate);
  const base = { query, referenceDate, facts: [] as CopilotLine[], forecasts: [] as CopilotLine[], assumptions: [] as string[], recommendations: [] as CopilotLine[] };
  const money = (n: number) => formatMoney(n, snapshot.workspace.currency);
  const scope = query.projectId ? analysis.projects.filter((p) => p.project.id === query.projectId) : analysis.projects;
  const add = <K extends "facts" | "forecasts" | "recommendations">(k: K, line: CopilotLine) => base[k].push(line);
  const forecastAssumptions = () => {
    for (const a of analysis.forecast.assumptions) if (!base.assumptions.includes(a)) base.assumptions.push(a);
  };

  if (!analysis.projects.length) {
    return { ...base, title: "No active projects", headline: "There are no active projects to analyse yet. Create a project and add tasks to get answers." };
  }

  switch (query.intent) {
    case "at_risk": {
      const rows = scope.map((p) => ({ p, f: p.forecastFinish })).sort((a, b) => (b.f?.slipWorkingDays ?? 999) - (a.f?.slipWorkingDays ?? 999));
      const late = rows.filter((r) => r.f?.slipWorkingDays === null || (r.f?.slipWorkingDays ?? 0) > 0);
      for (const { p, f } of rows) {
        add("facts", { text: `${p.project.name}: target ${formatShortDate(p.project.target_date)}, ${p.progress.percent}% of planned hours earned, ${p.progress.byStatus.blocked} blocked task(s)`, projectId: p.project.id });
        add("forecasts", {
          text: `${p.project.name}: forecast finish ${formatShortDate(f?.finish)} (${slipText(f?.slipWorkingDays ?? null)}); health ${p.health.score}/100`,
          tone: (f?.slipWorkingDays ?? 1) > 0 ? "critical" : healthTone(p),
          projectId: p.project.id,
        });
        for (const m of p.facts.milestones.filter((x) => !x.completed_at)) {
          const mf = analysis.forecast.milestones.get(m.id);
          if (mf && (mf.slipWorkingDays === null || mf.slipWorkingDays > 0)) add("forecasts", { text: `Milestone "${m.name}" (due ${formatShortDate(m.due_date)}): forecast ${formatShortDate(mf.finish)}, ${slipText(mf.slipWorkingDays)}`, tone: "warning", projectId: p.project.id });
        }
      }
      for (const d of analysis.decisions.filter((x) => scope.some((p) => p.project.id === x.projectId)).slice(0, 3)) add("recommendations", { text: `${d.projectName}: ${d.action}`, projectId: d.projectId });
      forecastAssumptions();
      const headline = late.length
        ? `${late.length} of ${rows.length} project(s) ${late.length === 1 ? "is" : "are"} forecast to miss the target date: ${late.map((r) => `${r.p.project.name} (${slipText(r.f?.slipWorkingDays ?? null)})`).join("; ")}.`
        : `All ${rows.length} project(s) are forecast to finish on or before their target dates. ${scope.filter((p) => p.health.status !== "on_track").length} still have open risks to watch.`;
      return { ...base, title: "Deadline risk", headline };
    }

    case "budget": {
      const verdicts: string[] = [];
      for (const p of scope) {
        const c = p.cost;
        const remainingBudget = c.budget - c.actualCost;
        add("facts", { text: `${p.project.name}: budget ${money(c.budget)}, spent ${money(c.actualCost)} (${c.burnPercent ?? 0}%), remaining ${money(remainingBudget)}`, projectId: p.project.id });
        add("forecasts", { text: `${p.project.name}: cost to complete ${money(c.estimateToComplete)} (${formatHours(p.progress.remainingHours)} remaining), projected total ${money(c.estimateAtCompletion)}`, projectId: p.project.id });
        const fits = c.estimateToComplete <= remainingBudget;
        add("forecasts", {
          text: fits
            ? `${p.project.name}: fits the remaining budget with ${money(remainingBudget - c.estimateToComplete)} to spare`
            : `${p.project.name}: needs ${money(c.estimateToComplete - remainingBudget)} more than the remaining budget`,
          tone: fits ? (c.variancePercent !== null && c.variancePercent < 10 ? "warning" : "healthy") : "critical",
          projectId: p.project.id,
        });
        verdicts.push(fits ? `${p.project.name} can finish within budget (${money(remainingBudget - c.estimateToComplete)} headroom)` : `${p.project.name} is forecast to overrun by ${money(c.estimateToComplete - remainingBudget)}`);
        if (!fits) add("recommendations", { text: `${p.project.name}: review the cost-reduction options, or agree a budget change of ${money(c.estimateToComplete - remainingBudget)} with the client before the overrun is incurred.`, projectId: p.project.id });
        if (c.defaultRateTaskIds.length) base.assumptions.push(`${p.project.name}: ${c.defaultRateTaskIds.length} open task(s) are costed at the workspace default rate of ${money(snapshot.workspace.default_hourly_rate)}/h (no owner or no hourly cost recorded).`);
      }
      base.assumptions.push("Cost to complete covers labor only: remaining hours × each owner's hourly cost. Future vendor, software or travel costs are included only once recorded.");
      return { ...base, title: query.projectId ? `Budget check: ${scope[0]?.project.name}` : "Budget check", headline: `${verdicts.join(". ")}.` };
    }

    case "priorities": {
      const until = addWorkingDays(referenceDate, PRIORITY_WINDOW_WORKING_DAYS - 1);
      const scored: { t: Task; p: ProjectAnalysis; score: number; reasons: string[] }[] = [];
      for (const p of scope) {
        const chain = new Set(criticalPath(p.project.id, p.facts.tasks, p.facts.dependencies, analysis.forecast).taskIds);
        for (const t of p.facts.tasks.filter(isOpen)) {
          const f = analysis.forecast.tasks.get(t.id);
          const reasons: string[] = [];
          let score = 0;
          if (chain.has(t.id)) {
            score += 40;
            reasons.push("on the chain that sets the forecast finish");
          }
          if (t.status === "blocked") {
            score += 30;
            reasons.push(t.blocked_until ? `blocked until ${formatShortDate(t.blocked_until)}` : "blocked with no expected-clear date");
          }
          if (t.due_date && t.due_date < referenceDate) {
            score += 25;
            reasons.push(`overdue since ${formatShortDate(t.due_date)}`);
          } else if (t.due_date && t.due_date <= until) {
            score += 15;
            reasons.push(`due ${formatShortDate(t.due_date)}`);
          }
          if (t.due_date && f?.finish && f.finish > t.due_date) {
            score += 15;
            reasons.push(`forecast ${workingDaysDiff(t.due_date, f.finish)} working days past due`);
          }
          if (t.is_critical) {
            score += 10;
            reasons.push("marked critical");
          }
          score += { critical: 8, high: 5, medium: 2, low: 0 }[t.priority];
          if (reasons.length) scored.push({ t, p, score, reasons });
        }
      }
      scored.sort((a, b) => b.score - a.score || (a.t.due_date ?? "9999").localeCompare(b.t.due_date ?? "9999") || a.t.id.localeCompare(b.t.id));
      const members = new Map(snapshot.members.map((m) => [m.id, m]));
      const top = scored.slice(0, PRIORITY_LIST_SIZE);
      top.forEach(({ t, p, reasons }, i) => {
        add("facts", { text: `${i + 1}. "${t.title}" — ${p.project.name}, owner ${t.assignee_id ? (members.get(t.assignee_id)?.name ?? "Unknown") : "Unassigned"}, ${formatHours(remainingHours(t))} remaining`, projectId: p.project.id });
        add("forecasts", { text: `${i + 1}. Why: ${reasons.join("; ")}`, tone: reasons.some((r) => r.startsWith("blocked") || r.startsWith("overdue")) ? "critical" : "warning", projectId: p.project.id });
      });
      for (const { t, p } of top.filter((x) => x.t.status === "blocked")) add("recommendations", { text: `Unblock "${t.title}" first: ${t.blocked_reason || "record the blocker and who can clear it"}.`, projectId: p.project.id });
      if (top.some((x) => !x.t.assignee_id)) add("recommendations", { text: "Assign owners to the unassigned priority tasks so their dates can be forecast against real capacity." });
      base.assumptions.push(
        `Ranking is rule-based: critical-path chain, then blocked, overdue, due within ${PRIORITY_WINDOW_WORKING_DAYS} working days (by ${formatShortDate(until)}), forecast past due, marked critical, then priority.`,
      );
      forecastAssumptions();
      return { ...base, title: "Priorities this week", headline: top.length ? `Start with "${top[0].t.title}" (${top[0].p.project.name}): ${top[0].reasons[0]}.` : "No open task is overdue, blocked, on the critical chain or due this week." };
    }

    case "overloaded": {
      const over = analysis.loads.filter((l) => l.loadPercent > OVERLOAD_THRESHOLD_PERCENT).sort((a, b) => b.loadPercent - a.loadPercent);
      const projectNames = new Map(snapshot.projects.map((p) => [p.id, p.name]));
      for (const l of analysis.loads.filter((x) => x.assignedHours > 0).sort((a, b) => b.loadPercent - a.loadPercent)) {
        add("forecasts", { text: `${l.name}: ${l.loadPercent}% (${l.assignedHours} h of work, ${l.capacityHours} h available)`, tone: l.loadPercent > OVERLOAD_THRESHOLD_PERCENT ? "critical" : l.loadPercent > 90 ? "warning" : "healthy" });
      }
      for (const l of over) {
        const byProject = [...new Set(l.tasks.map((t) => t.projectId))].map((id) => projectNames.get(id)).join(", ");
        add("facts", { text: `${l.name} has ${l.tasks.length} open task(s) with work in the window across ${byProject}` });
      }
      for (const d of analysis.decisions.filter((x) => x.rule === "resource_overload")) add("recommendations", { text: d.action, projectId: d.projectId });
      base.assumptions.push(`Load = remaining hours falling in the next 10 working days (${formatShortDate(analysis.window.start)}–${formatShortDate(analysis.window.end)}) ÷ capacity in that window. Overloaded means above ${OVERLOAD_THRESHOLD_PERCENT}%.`);
      return { ...base, title: "Team workload", headline: over.length ? `${over.length} ${over.length === 1 ? "person is" : "people are"} overloaded: ${over.map((l) => `${l.name} (${l.loadPercent}%)`).join(", ")}.` : "Nobody is above 100% of capacity in the next 10 working days." };
    }

    case "cost_reduction": {
      const members = new Map(snapshot.members.map((m) => [m.id, m]));
      const loadOf = new Map(analysis.loads.map((l) => [l.memberId, l]));
      let total = 0;
      for (const p of scope) {
        const chain = new Set(criticalPath(p.project.id, p.facts.tasks, p.facts.dependencies, analysis.forecast).taskIds);
        const protectedTask = (t: Task) => t.is_critical || chain.has(t.id);
        for (const t of p.facts.tasks.filter((x) => isOpen(x) && !protectedTask(x) && x.status !== "blocked")) {
          const hours = remainingHours(t);
          if (hours <= 0) continue;
          const owner = t.assignee_id ? members.get(t.assignee_id) : undefined;
          const rate = hourlyRate(t, members, snapshot.workspace);
          // Same-discipline colleague with a lower rate and enough free hours in the window.
          const cheaper = snapshot.members
            .filter((m) => m.active && m.id !== owner?.id && (!owner?.discipline || m.discipline === owner.discipline) && m.hourly_cost !== null && m.hourly_cost < rate)
            .filter((m) => (loadOf.get(m.id)?.freeHours ?? 0) >= Math.min(hours, (loadOf.get(m.id)?.capacityHours ?? 0)) && (loadOf.get(m.id)?.freeHours ?? 0) > 0)
            .sort((a, b) => a.hourly_cost! - b.hourly_cost! || a.name.localeCompare(b.name))[0];
          if (cheaper) {
            const saving = Math.round(hours * (rate - cheaper.hourly_cost!));
            total += saving;
            add("forecasts", { text: `Reassign "${t.title}" (${p.project.name}, ${formatHours(hours)}) from ${owner?.name ?? "Unassigned"} at ${money(rate)}/h to ${cheaper.name} at ${money(cheaper.hourly_cost!)}/h: ${money(saving)} lower cost to complete`, tone: "healthy", projectId: p.project.id });
          } else if (t.status === "todo") {
            add("forecasts", { text: `Defer "${t.title}" (${p.project.name}, not started, not critical): removes ${formatHours(hours)} and ${money(Math.round(hours * rate))} from cost to complete`, tone: "neutral", projectId: p.project.id });
          }
        }
        add("facts", { text: `${p.project.name}: cost to complete ${money(p.cost.estimateToComplete)}; ${[...chain].length} task(s) on the critical chain and ${p.facts.tasks.filter((t) => isOpen(t) && t.is_critical).length} marked critical are protected`, projectId: p.project.id });
      }
      if (!base.forecasts.length) base.forecasts.push({ text: "No non-critical open work has a cheaper same-discipline owner with free capacity, and no non-critical task is unstarted.", tone: "neutral" });
      add("recommendations", { text: "Model any option in What-if before applying it: reassignments re-level every affected person's queue across projects, and deferral is reversible." });
      base.assumptions.push(
        "Protected work = tasks marked critical, tasks on the chain that sets the forecast finish, and blocked tasks; none of these are proposed for change.",
        "Reassignment candidates share the current owner's discipline, cost less per hour and have free hours in the next 10 working days. Ramp-up time is not modelled.",
        "Figures are reductions in forecast labor cost to complete, not guaranteed savings; deferral moves scope out of this plan rather than eliminating it.",
      );
      return { ...base, title: "Cost reduction options", headline: total > 0 ? `Reassigning non-critical work to lower-cost colleagues would reduce the forecast cost to complete by ${money(total)} without touching critical deliverables.` : "No reassignment lowers cost without touching critical work; the options listed are deferrals of non-critical scope." };
    }

    case "delay": {
      const milestone = snapshot.milestones.find((m) => m.id === query.milestoneId);
      if (!milestone) return { ...base, title: "Milestone delay", headline: "Choose a milestone to model the delay." };
      return { ...delayImpact(snapshot, analysis, milestone, query.days ?? 5, money), query, referenceDate };
    }

    case "weekly_summary": {
      const m = analysis.metrics;
      add("facts", { text: `${m.activeProjects} active project(s); ${m.overdueMilestones} overdue milestone(s); ${m.criticalDeadlines} milestone(s) or critical task(s) due in the next 14 days` });
      for (const p of scope) {
        add("facts", { text: `${p.project.name} (${p.project.methodology === "agile" ? "Agile" : "Waterfall"}): ${p.progress.percent}% complete, ${money(p.cost.actualCost)} of ${money(p.cost.budget)} spent`, projectId: p.project.id });
        add("forecasts", {
          text: `${p.project.name}: health ${p.health.score}/100; forecast finish ${formatShortDate(p.forecastFinish?.finish)} (${slipText(p.forecastFinish?.slipWorkingDays ?? null)}); projected cost ${money(p.cost.estimateAtCompletion)} (${p.cost.variance >= 0 ? `${money(p.cost.variance)} under` : `${money(-p.cost.variance)} over`} budget)`,
          tone: healthTone(p),
          projectId: p.project.id,
        });
        if (p.project.methodology === "agile") {
          const ag = computeAgile(snapshot.sprints.filter((s) => s.project_id === p.project.id), p.facts.tasks, referenceDate);
          if (ag.active) add("forecasts", { text: `${p.project.name}: ${ag.active.sprint.name} has ${ag.active.committedPoints} points committed; average velocity ${ag.velocity ?? "not yet known"}${ag.overcommit ? ` (${ag.overcommit.percentOver}% over)` : ""}`, tone: ag.overcommit ? "warning" : "neutral", projectId: p.project.id });
        }
      }
      if (m.budgetExposure > 0) add("forecasts", { text: `Portfolio budget exposure: ${money(m.budgetExposure)} forecast overrun across projects that are over budget`, tone: "critical" });
      for (const d of analysis.decisions.slice(0, 3)) add("recommendations", { text: `${d.projectName}: ${d.action}`, projectId: d.projectId });
      forecastAssumptions();
      const worst = [...scope].sort((a, b) => a.health.score - b.health.score)[0];
      return { ...base, title: "Weekly executive summary", headline: `${m.needingIntervention} of ${m.activeProjects} project(s) need intervention; the most urgent is ${worst.project.name} (health ${worst.health.score}/100). Budget exposure is ${money(m.budgetExposure)}.` };
    }
  }
}

// ── Milestone delay what-if ─────────────────────────────────────────────────

/**
 * Models "milestone M finishes N working days after its current forecast": every open task
 * downstream of M's work (through dependencies, outside M) may not start until the day after
 * the delayed finish. The capacity forecast is re-run on a copy of the snapshot.
 */
function delayImpact(snapshot: WorkspaceSnapshot, before: WorkspaceAnalysis, milestone: Milestone, days: number, money: (n: number) => string): Omit<CopilotAnswer, "query" | "referenceDate"> {
  const ref = before.referenceDate;
  const project = snapshot.projects.find((p) => p.id === milestone.project_id) as Project;
  const mf = before.forecast.milestones.get(milestone.id);
  const facts: CopilotLine[] = [];
  const forecasts: CopilotLine[] = [];
  const assumptions: string[] = [];
  const recommendations: CopilotLine[] = [];
  facts.push({ text: `Milestone "${milestone.name}" (${project.name}) is due ${formatShortDate(milestone.due_date)}`, projectId: project.id });
  if (!mf?.finish) {
    return { title: `Delay: ${milestone.name}`, headline: `"${milestone.name}" has no schedulable forecast (no open work or missing capacity), so a delay cannot be modelled.`, facts, forecasts, assumptions, recommendations };
  }
  const delayed = addWorkingDays(mf.finish, days);
  const startAfter = addWorkingDays(delayed, 1);
  const graph = buildGraph(snapshot.dependencies.filter((d) => d.project_id === project.id));
  const own = snapshot.tasks.filter((t) => t.milestone_id === milestone.id && isOpen(t) && !t.deferred_at);
  const downstream = new Set(own.flatMap((t) => [...reachable(graph.downstream, t.id)]));
  const ownIds = new Set(own.map((t) => t.id));
  const gated = snapshot.tasks.filter((t) => downstream.has(t.id) && !ownIds.has(t.id) && isOpen(t) && !t.deferred_at);

  const copy = structuredClone(snapshot);
  const gatedIds = new Set(gated.map((t) => t.id));
  for (const t of copy.tasks) if (gatedIds.has(t.id) && (!t.start_date || t.start_date < startAfter)) t.start_date = startAfter;
  const after = analyzeWorkspace(copy, ref);

  const pb = before.forecast.projects.get(project.id);
  const pa = after.forecast.projects.get(project.id);
  const finishAfter = pa?.finish && pa.finish > delayed ? pa.finish : delayed;
  const slipAfter = workingDaysDiff(project.target_date, finishAfter);

  facts.push({ text: `${own.length} open task(s) belong to the milestone; ${gated.length} open task(s) downstream depend on its work`, projectId: project.id });
  forecasts.push({ text: `"${milestone.name}": forecast ${formatShortDate(mf.finish)} → ${formatShortDate(delayed)} (${slipText(workingDaysDiff(milestone.due_date, delayed))})`, tone: "warning", projectId: project.id });
  forecasts.push({
    text: `${project.name} finish: ${formatShortDate(pb?.finish)} → ${formatShortDate(finishAfter)}; target ${formatShortDate(project.target_date)} (${slipText(slipAfter)})`,
    tone: slipAfter > 0 ? "critical" : "healthy",
    projectId: project.id,
  });
  for (const m of snapshot.milestones.filter((x) => x.project_id === project.id && !x.completed_at && x.id !== milestone.id)) {
    const b = before.forecast.milestones.get(m.id);
    const a = after.forecast.milestones.get(m.id);
    if (b?.finish !== a?.finish) forecasts.push({ text: `Milestone "${m.name}" (due ${formatShortDate(m.due_date)}): ${formatShortDate(b?.finish)} → ${formatShortDate(a?.finish)} (${slipText(a?.slipWorkingDays ?? null)})`, tone: (a?.slipWorkingDays ?? 1) > 0 ? "critical" : "neutral", projectId: project.id });
  }
  for (const p of before.projects.filter((x) => x.project.id !== project.id)) {
    const b = before.forecast.projects.get(p.project.id);
    const a = after.forecast.projects.get(p.project.id);
    if (b?.finish !== a?.finish) forecasts.push({ text: `${p.project.name} (shared people): ${formatShortDate(b?.finish)} → ${formatShortDate(a?.finish)}`, tone: "neutral", projectId: p.project.id });
  }
  const pAfter = after.projects.find((x) => x.project.id === project.id);
  if (pAfter) facts.push({ text: `Projected cost stays ${money(pAfter.cost.estimateAtCompletion)}: a delay with no extra effort adds no labor cost`, projectId: project.id });

  const daysLeft = workingDaysInclusive(addWorkingDays(ref, 0), project.target_date);
  if (slipAfter > 0) {
    recommendations.push({ text: `Protect the target: the chain after "${milestone.name}" would need ${slipAfter} working days back. Model adding capacity to that work or deferring non-critical scope in What-if.`, projectId: project.id });
    recommendations.push({ text: `If the delay is likely, tell the client now and agree a revised target before the ${daysLeft} working days to the current target run out.`, projectId: project.id });
  } else {
    recommendations.push({ text: `The project absorbs this delay: the target still holds with ${-slipAfter} working day(s) of margin.`, projectId: project.id });
  }
  assumptions.push(
    `The milestone's work finishes ${days} working day(s) after its current forecast; downstream work cannot start before ${formatShortDate(startAfter)}.`,
    "No extra effort is added, so cost is unchanged. If the delay comes from more work, record the extra hours to see their cost.",
    "The people on the delayed work are not assumed to be busier; the forecast re-levels everyone else's queues as usual.",
  );
  for (const a of after.forecast.assumptions) if (!assumptions.includes(a)) assumptions.push(a);
  return {
    title: `Delay: ${milestone.name} by ${days} working days`,
    headline:
      slipAfter > 0
        ? `A ${days}-day delay to "${milestone.name}" moves ${project.name}'s forecast finish to ${formatShortDate(finishAfter)}, ${slipAfter} working days after the target.`
        : `A ${days}-day delay to "${milestone.name}" is absorbed: ${project.name} still finishes by ${formatShortDate(finishAfter)}, within the target.`,
    facts,
    forecasts,
    assumptions,
    recommendations,
  };
}
