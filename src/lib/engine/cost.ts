import type { BudgetCategory, BudgetEntry, Project, Task, TeamMember, Workspace } from "@/lib/types";
import { remainingHours } from "./progress";

// Earned-value style cost view.
//   AC  (actual cost)            = Σ recorded budget entries
//   ETC (estimate to complete)   = Σ remaining hours × assignee hourly cost
//                                  (workspace default rate when unknown)
//   EAC (estimate at completion) = AC + ETC
//   Budget variance              = budget − EAC  (negative = forecast overrun)

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CostMetrics {
  budget: number;
  actualCost: number;
  estimateToComplete: number;
  estimateAtCompletion: number;
  /** budget − EAC. Negative means the project is forecast to overrun. */
  variance: number;
  /** variance ÷ budget × 100; null when no budget is set. */
  variancePercent: number | null;
  /** AC ÷ budget × 100; null when no budget is set. */
  burnPercent: number | null;
  byCategory: Record<BudgetCategory, number>;
  /** Open tasks costed at the workspace default rate (no assignee or no hourly cost). */
  defaultRateTaskIds: string[];
}

export function hourlyRate(task: Task, members: Map<string, TeamMember>, workspace: Workspace): number {
  const member = task.assignee_id ? members.get(task.assignee_id) : undefined;
  return member?.hourly_cost ?? workspace.default_hourly_rate;
}

export function computeCost(
  project: Project,
  tasks: Task[],
  entries: BudgetEntry[],
  members: Map<string, TeamMember>,
  workspace: Workspace,
): CostMetrics {
  const byCategory: Record<BudgetCategory, number> = { labor: 0, vendor: 0, software: 0, travel: 0, other: 0 };
  let actualCost = 0;
  for (const e of entries) {
    actualCost += e.amount;
    byCategory[e.category] += e.amount;
  }

  let etc = 0;
  const defaultRateTaskIds: string[] = [];
  for (const t of tasks) {
    const hours = remainingHours(t);
    if (hours <= 0) continue;
    const member = t.assignee_id ? members.get(t.assignee_id) : undefined;
    if (member?.hourly_cost == null) defaultRateTaskIds.push(t.id);
    etc += hours * hourlyRate(t, members, workspace);
  }

  const eac = actualCost + etc;
  const variance = project.budget - eac;
  return {
    budget: round2(project.budget),
    actualCost: round2(actualCost),
    estimateToComplete: round2(etc),
    estimateAtCompletion: round2(eac),
    variance: round2(variance),
    variancePercent: project.budget > 0 ? Math.round((variance / project.budget) * 1000) / 10 : null,
    burnPercent: project.budget > 0 ? Math.round((actualCost / project.budget) * 1000) / 10 : null,
    byCategory,
    defaultRateTaskIds,
  };
}
