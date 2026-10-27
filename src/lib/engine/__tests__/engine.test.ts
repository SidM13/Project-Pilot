import { describe, expect, it } from "vitest";
import { addWorkingDays, workingDaysInclusive } from "../dates";
import { topologicalOrder, wouldCreateCycle } from "../graph";
import { computeProgress, remainingHours } from "../progress";
import { computeCost } from "../cost";
import { computeLoads, hoursInWindow, loadWindow } from "../capacity";
import { computeHealth } from "../health";
import { analyzeWorkspace } from "../index";
import type { Finding } from "../findings";
import { dep, entry, member, milestone, project, snapshot, task, workspace } from "./fixtures";

describe("working-day arithmetic", () => {
  it("counts Mon–Fri inclusively", () => {
    expect(workingDaysInclusive("2026-11-16", "2026-11-27")).toBe(10);
    expect(workingDaysInclusive("2026-11-21", "2026-11-22")).toBe(0); // weekend
    expect(workingDaysInclusive("2026-11-27", "2026-11-16")).toBe(0);
  });
  it("adds working days, skipping weekends", () => {
    expect(addWorkingDays("2026-11-20", 1)).toBe("2026-11-23"); // Fri → Mon
    expect(addWorkingDays("2026-11-21", 0)).toBe("2026-11-23"); // Sat → next working day
  });
});

describe("dependency validation", () => {
  const edges = [dep("p", "b", "a"), dep("p", "c", "b")]; // a → b → c

  it("rejects self-dependencies and direct or transitive cycles", () => {
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "b")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "c")).toBe(true);
  });
  it("allows edges that keep the graph acyclic", () => {
    expect(wouldCreateCycle(edges, "c", "a")).toBe(false); // redundant but valid
    expect(wouldCreateCycle(edges, "d", "c")).toBe(false);
  });
  it("orders tasks after their dependencies and detects cycles", () => {
    expect(topologicalOrder(["c", "b", "a"], edges)).toEqual(["a", "b", "c"]);
    expect(() => topologicalOrder(["a", "b"], [dep("p", "a", "b"), dep("p", "b", "a")])).toThrow(/cycle/);
  });
});

describe("effort and progress", () => {
  it("derives remaining hours from planned − actual when no estimate is recorded", () => {
    expect(remainingHours(task("p", { planned_hours: 40, actual_hours: 25 }))).toBe(15);
    expect(remainingHours(task("p", { planned_hours: 40, actual_hours: 55 }))).toBe(0);
    expect(remainingHours(task("p", { planned_hours: 40, actual_hours: 10, remaining_hours: 50 }))).toBe(50);
    expect(remainingHours(task("p", { status: "done", remaining_hours: 12 }))).toBe(0);
  });
  it("weights progress by earned effort", () => {
    const p = computeProgress([
      task("p", { status: "done", planned_hours: 30 }),
      task("p", { status: "in_progress", planned_hours: 50, actual_hours: 10, remaining_hours: 30 }), // earns 20
      task("p", { planned_hours: 20 }),
    ]);
    expect(p.percent).toBe(50);
    expect(p.remainingHours).toBe(50);
  });
});

describe("budget variance", () => {
  const ws = workspace({ default_hourly_rate: 100 });
  const dev = member({ id: "dev", hourly_cost: 150 });
  const members = new Map([[dev.id, dev]]);

  it("forecasts EAC from actual spend plus remaining hours at assignee rates", () => {
    const p = project({ id: "p", budget: 10000 });
    const tasks = [
      task("p", { assignee_id: "dev", planned_hours: 20, actual_hours: 0 }), // 20 h × 150
      task("p", { planned_hours: 10 }), // unassigned: 10 h × 100 default
      task("p", { status: "done", planned_hours: 50 }),
    ];
    const cost = computeCost(p, tasks, [entry("p", 6000), entry("p", 1500, { category: "software" })], members, ws);
    expect(cost.actualCost).toBe(7500);
    expect(cost.estimateToComplete).toBe(4000);
    expect(cost.estimateAtCompletion).toBe(11500);
    expect(cost.variance).toBe(-1500);
    expect(cost.variancePercent).toBe(-15);
    expect(cost.burnPercent).toBe(75);
    expect(cost.byCategory.software).toBe(1500);
    expect(cost.defaultRateTaskIds).toEqual([tasks[1].id]);
  });
  it("reports no percentages when no budget is set", () => {
    const cost = computeCost(project({ id: "p", budget: 0 }), [], [], members, ws);
    expect(cost.variancePercent).toBeNull();
    expect(cost.burnPercent).toBeNull();
  });
  it("raises an overrun finding with severity from the overrun percentage", () => {
    const p = project({ id: "p", budget: 10000 });
    const a = analyzeWorkspace(
      snapshot({ workspace: ws, projects: [p], tasks: [task("p", { planned_hours: 20 })], budgetEntries: [entry("p", 9000)] }),
      "2026-11-16",
    );
    const f = a.projects[0].findings.find((x) => x.rule === "budget_overrun")!;
    expect(f.severity).toBe("critical"); // EAC 11 000 → 10% over
    expect(a.metrics.budgetExposure).toBe(1000);
  });
});

describe("resource load", () => {
  const win = loadWindow("2026-11-16"); // Mon 16 – Fri 27, 10 working days

  it("spreads remaining hours across the task's working days", () => {
    expect(win).toEqual({ start: "2026-11-16", end: "2026-11-27", workingDays: 10 });
    // 20 h over Mon 23 → Tue Dec 1 (7 working days), 5 of them inside the window
    expect(hoursInWindow(task("p", { planned_hours: 20, start_date: "2026-11-23", due_date: "2026-12-01" }), win)).toBeCloseTo((20 * 5) / 7);
    expect(hoursInWindow(task("p", { planned_hours: 12, due_date: "2026-11-10" }), win)).toBe(12); // overdue counts in full
    expect(hoursInWindow(task("p", { planned_hours: 12, start_date: "2026-12-07" }), win)).toBe(0);
  });
  it("computes load against weekly capacity", () => {
    const m = member({ id: "m", weekly_capacity_hours: 20 }); // 40 h in window
    const [load] = computeLoads([task("p", { assignee_id: "m", planned_hours: 50 })], [m], workspace(), win);
    expect(load.loadPercent).toBe(125);
    expect(load.freeHours).toBe(-10);
  });
});

describe("findings and health", () => {
  const ref = "2026-11-16";

  it("does not double-count a blocked task that is also overdue", () => {
    const p = project({ id: "p" });
    const t = task("p", { status: "blocked", priority: "high", due_date: "2026-11-10" });
    const a = analyzeWorkspace(snapshot({ projects: [p], tasks: [t] }), ref);
    const rules = a.projects[0].findings.map((f) => f.rule);
    expect(rules).toContain("blocked_task");
    expect(rules).not.toContain("overdue_task");
  });

  it("computes slack from the dependent chain to the affected milestone", () => {
    const m = member({ id: "dev", weekly_capacity_hours: 40 }); // 8 h/day
    const p = project({ id: "p" });
    const ms = milestone("p", { id: "ms", name: "Data ready", due_date: "2026-11-27" }); // 10 working days
    const blocked = task("p", { id: "a", status: "blocked", priority: "critical", milestone_id: "ms", assignee_id: "dev", planned_hours: 32 }); // 4 days
    const next = task("p", { id: "b", milestone_id: "ms", assignee_id: "dev", planned_hours: 40, start_date: ref }); // 5 days
    const a = analyzeWorkspace(snapshot({ members: [m], projects: [p], milestones: [ms], tasks: [blocked, next], dependencies: [dep("p", "b", "a")] }), ref);
    const f = a.projects[0].findings.find((x) => x.rule === "blocked_task")!;
    expect(f.impact?.value).toBe(1);
    expect(f.impact?.label).toMatch(/Must clear by Nov 17/);
    expect(f.taskIds).toContain("b"); // waiting task is cited
  });

  it("flags a milestone when its owner lacks capacity before the due date", () => {
    const m = member({ id: "dev", name: "Dev", weekly_capacity_hours: 40 });
    const p = project({ id: "p" });
    const ms = milestone("p", { id: "ms", due_date: "2026-11-18" }); // 3 working days = 24 h
    const t = task("p", { milestone_id: "ms", assignee_id: "dev", planned_hours: 30 });
    const a = analyzeWorkspace(snapshot({ members: [m], projects: [p], milestones: [ms], tasks: [t] }), ref);
    const f = a.projects[0].findings.find((x) => x.rule === "milestone_at_risk")!;
    expect(f.severity).toBe("high");
    expect(f.impact?.value).toBe(6);
  });

  it("caps penalties per category and bands the score", () => {
    const f = (id: string, rule: Finding["rule"], severity: Finding["severity"]): Finding => ({
      id, rule, severity, projectId: "p", title: id, evidence: [], impact: null, taskIds: [], milestoneIds: [], memberIds: [],
    });
    const h = computeHealth([f("a", "blocked_task", "critical"), f("b", "overdue_task", "critical"), f("c", "milestone_overdue", "critical"), f("d", "budget_overrun", "high")]);
    expect(h.penalties.find((p) => p.category === "schedule")).toMatchObject({ rawPoints: 75, points: 50 });
    expect(h.score).toBe(35);
    expect(h.status).toBe("critical");
    expect(computeHealth([]).score).toBe(100);
  });

  it("excludes archived and completed projects from analysis", () => {
    const a = analyzeWorkspace(
      snapshot({ projects: [project({ archived_at: "2026-11-01T00:00:00Z" }), project({ status: "completed" }), project()] }),
      ref,
    );
    expect(a.projects).toHaveLength(1);
    expect(a.metrics.activeProjects).toBe(1);
  });

  it("uses only the reference date, never the wall clock", () => {
    const p = project({ id: "p" });
    const t = task("p", { due_date: "2026-11-10", priority: "high" });
    const s = snapshot({ projects: [p], tasks: [t] });
    const rules = (ref: string) => analyzeWorkspace(s, ref).projects[0].findings.map((f) => f.rule);
    expect(rules("2026-11-09")).not.toContain("overdue_task");
    expect(rules("2026-11-16")).toContain("overdue_task");
  });
});
