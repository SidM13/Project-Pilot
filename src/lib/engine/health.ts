import { RULE_CATEGORY, type Finding, type FindingCategory, type Severity } from "./findings";

// Health score: start at 100, subtract points per finding, capped per category
// so one category cannot hide the others. Bands: ≥ 75 on track, ≥ 50 at risk, < 50 critical.

export type HealthStatus = "on_track" | "at_risk" | "critical";

export const SEVERITY_POINTS: Record<Severity, number> = { critical: 25, high: 15, medium: 8, low: 3 };
export const CATEGORY_CAPS: Record<FindingCategory, number> = { schedule: 50, budget: 25, resources: 15 };
export const HEALTH_THRESHOLDS = { onTrack: 75, atRisk: 50 };

export interface HealthPenalty {
  category: FindingCategory;
  points: number;
  /** Uncapped sum, so the UI can show when a cap applied. */
  rawPoints: number;
  findingIds: string[];
}

export interface HealthResult {
  score: number;
  status: HealthStatus;
  penalties: HealthPenalty[];
}

export function healthStatus(score: number): HealthStatus {
  if (score >= HEALTH_THRESHOLDS.onTrack) return "on_track";
  if (score >= HEALTH_THRESHOLDS.atRisk) return "at_risk";
  return "critical";
}

export function computeHealth(findings: Finding[]): HealthResult {
  const penalties: HealthPenalty[] = [];
  for (const category of Object.keys(CATEGORY_CAPS) as FindingCategory[]) {
    const own = findings.filter((f) => RULE_CATEGORY[f.rule] === category);
    if (!own.length) continue;
    const rawPoints = own.reduce((s, f) => s + SEVERITY_POINTS[f.severity], 0);
    penalties.push({ category, rawPoints, points: Math.min(rawPoints, CATEGORY_CAPS[category]), findingIds: own.map((f) => f.id) });
  }
  const score = Math.max(0, 100 - penalties.reduce((s, p) => s + p.points, 0));
  return { score, status: healthStatus(score), penalties };
}
