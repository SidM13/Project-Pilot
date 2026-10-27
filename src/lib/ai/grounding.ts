import type { SimulationResult } from "@/lib/engine/simulate";
import type { WorkspaceSnapshot } from "@/lib/types";
import { formatMoney, formatShortDate } from "@/lib/format";

// Grounding: the model only ever sees a compact JSON context built from engine
// output, and every figure in its answer must appear in that context. Derived
// figures (deltas) are pre-computed here so the model never has to do arithmetic.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Compact, model-facing description of a simulation. All values come from the engine. */
export function simulationContext(snapshot: WorkspaceSnapshot, result: SimulationResult) {
  const project = snapshot.projects.find((p) => p.id === result.projectId)!;
  const currency = snapshot.workspace.currency;
  const money = (n: number) => formatMoney(n, currency);
  const { current: c, proposed: p } = result;
  const people = new Set<string>();
  if (result.scenario.kind === "reassign") {
    const t = snapshot.tasks.find((x) => x.id === (result.scenario as { taskId: string }).taskId);
    if (t?.assignee_id) people.add(t.assignee_id);
    people.add(result.scenario.toMemberId);
  }
  return {
    project: { name: project.name, client: project.client_name || null, referenceDate: formatShortDate(result.referenceDate) },
    scenario: { type: result.scenario.kind, changes: result.changes },
    current: {
      forecastFinish: formatShortDate(c.forecastFinish),
      target: formatShortDate(c.targetDate),
      workingDaysLate: c.slipWorkingDays,
      projectedCost: money(c.projectedCost),
      budget: money(c.budget),
      budgetVariance: money(c.budgetVariance),
      tasksAtRisk: c.tasksAtRisk,
      healthScore: c.healthScore,
    },
    proposed: {
      forecastFinish: formatShortDate(p.forecastFinish),
      target: formatShortDate(p.targetDate),
      workingDaysLate: p.slipWorkingDays,
      projectedCost: money(p.projectedCost),
      budgetVariance: money(p.budgetVariance),
      tasksAtRisk: p.tasksAtRisk,
      healthScore: p.healthScore,
    },
    change: {
      workingDaysLate: c.slipWorkingDays !== null && p.slipWorkingDays !== null ? p.slipWorkingDays - c.slipWorkingDays : null,
      projectedCost: money(p.projectedCost - c.projectedCost),
      tasksAtRisk: p.tasksAtRisk - c.tasksAtRisk,
      healthScore: p.healthScore - c.healthScore,
      remainingHours: Math.round(p.remainingHours - c.remainingHours),
    },
    milestones: c.milestones.map((m) => {
      const pm = p.milestones.find((x) => x.id === m.id);
      return { name: m.name, due: formatShortDate(pm?.due ?? m.due), currentForecast: formatShortDate(m.forecast), currentWorkingDaysLate: m.slip, proposedForecast: formatShortDate(pm?.forecast), proposedWorkingDaysLate: pm?.slip ?? null };
    }),
    otherProjects: result.portfolio.map((x) => ({ name: x.projectName, currentFinish: formatShortDate(x.before.finish), proposedFinish: formatShortDate(x.after.finish), proposedWorkingDaysLate: x.after.slip })),
    people: snapshot.members
      .filter((m) => people.has(m.id))
      .map((m) => ({ name: m.name, discipline: m.discipline || null, weeklyCapacityHours: m.weekly_capacity_hours, hourlyCost: m.hourly_cost === null ? null : money(m.hourly_cost) })),
    downstreamEffects: result.affected,
    assumptions: result.assumptions,
  };
}

export type SimulationContext = ReturnType<typeof simulationContext>;

// ── Figure checking ───────────────────────────────────────────────────────────

const DATE_RE = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})\\b`, "gi");
const NUMBER_RE = /\$?\d+(?:,\d{3})*(?:\.\d+)?/g;

const dateKey = (month: string, day: string) => `${MONTHS.indexOf(month.slice(0, 3).toLowerCase()) + 1}-${Number(day)}`;
const toNumber = (token: string) => Number(token.replace(/[$,]/g, ""));

/** Every number and date mentioned anywhere in the context (including inside text such as evidence). */
export function allowedFigures(context: unknown) {
  const numbers = new Set<number>();
  const dates = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === "number") {
      numbers.add(Math.abs(v));
      numbers.add(Math.round(Math.abs(v)));
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
        dates.add(`${Number(m[2])}-${Number(m[3])}`);
        numbers.add(Number(m[1]));
      }
      const withoutDates = v.replace(DATE_RE, (_, mo: string, d: string) => {
        dates.add(dateKey(mo, d));
        return " ";
      });
      for (const n of withoutDates.match(NUMBER_RE) ?? []) numbers.add(Math.abs(toNumber(n)));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(context);
  return { numbers, dates };
}

/**
 * Figures in `texts` that do not appear in the context — evidence the model invented
 * or derived a number. Any result means the output must not be shown.
 */
export function findUngroundedFigures(texts: string[], allowed: ReturnType<typeof allowedFigures>): string[] {
  const bad: string[] = [];
  for (const text of texts) {
    const withoutDates = text.replace(DATE_RE, (match, mo: string, d: string) => {
      if (!allowed.dates.has(dateKey(mo, d))) bad.push(match);
      return " ";
    });
    for (const token of withoutDates.match(NUMBER_RE) ?? []) {
      if (!allowed.numbers.has(Math.abs(toNumber(token)))) bad.push(token);
    }
  }
  return [...new Set(bad)];
}

/** Flattens every string in a model output for checking. */
export function outputTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(outputTexts);
  if (value && typeof value === "object") return Object.values(value).flatMap(outputTexts);
  return [];
}
