import { describe, expect, it } from "vitest";
import { forecast, workingDaysDiff } from "../forecast";
import { dep, member, milestone, project, task, workspace } from "./fixtures";

const ref = "2026-11-16"; // Monday
const ws = workspace({ default_weekly_capacity: 40 });
const dev = member({ id: "dev", weekly_capacity_hours: 40 }); // 8 h/day
const p = project({ id: "p", target_date: "2026-11-27" });
const run = (tasks: ReturnType<typeof task>[], deps = [] as ReturnType<typeof dep>[], extra: { milestones?: ReturnType<typeof milestone>[]; members?: ReturnType<typeof member>[] } = {}, opts = {}) =>
  forecast({ workspace: ws, members: extra.members ?? [dev], projects: [p], milestones: extra.milestones ?? [], tasks, dependencies: deps }, ref, opts);

describe("workingDaysDiff", () => {
  it("counts signed working days", () => {
    expect(workingDaysDiff("2026-11-20", "2026-11-23")).toBe(1); // Fri → Mon
    expect(workingDaysDiff("2026-11-23", "2026-11-20")).toBe(-1);
    expect(workingDaysDiff("2026-11-16", "2026-11-16")).toBe(0);
  });
});

describe("capacity forecast", () => {
  it("schedules one person's tasks sequentially, critical path first", () => {
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 16 });
    const b = task("p", { id: "b", assignee_id: "dev", planned_hours: 16, is_critical: true });
    const f = run([a, b]);
    expect(f.tasks.get("b")!.finish).toBe("2026-11-17");
    expect(f.tasks.get("a")!.finish).toBe("2026-11-19");
  });

  it("splits a day across tasks when one finishes mid-day", () => {
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 4, priority: "high" });
    const b = task("p", { id: "b", assignee_id: "dev", planned_hours: 12 });
    const f = run([a, b]);
    expect(f.tasks.get("a")!.finish).toBe("2026-11-16");
    expect(f.tasks.get("b")!.finish).toBe("2026-11-17"); // 4 h Mon + 8 h Tue
  });

  it("starts dependent work the working day after its dependency finishes", () => {
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 4 });
    const other = member({ id: "qa", weekly_capacity_hours: 40 });
    const b = task("p", { id: "b", assignee_id: "qa", planned_hours: 8 });
    const f = run([a, b], [dep("p", "b", "a")], { members: [dev, other] });
    expect(f.tasks.get("b")!.start).toBe("2026-11-17");
    expect(f.tasks.get("b")!.finish).toBe("2026-11-17");
  });

  it("respects planned start dates and skips weekends", () => {
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 16, start_date: "2026-11-20" }); // Fri
    expect(run([a]).tasks.get("a")).toMatchObject({ start: "2026-11-20", finish: "2026-11-23" });
  });

  it("models contention across projects", () => {
    const other = project({ id: "q" });
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 40, is_critical: true });
    const b = task("q", { id: "b", assignee_id: "dev", planned_hours: 8 });
    const f = forecast({ workspace: ws, members: [dev], projects: [p, other], milestones: [], tasks: [a, b], dependencies: [] }, ref);
    expect(f.tasks.get("b")!.finish).toBe("2026-11-23");
  });

  it("delays blocked tasks by the clearance assumption and reports it", () => {
    const a = task("p", { id: "a", status: "blocked", assignee_id: "dev", planned_hours: 8 });
    expect(run([a]).tasks.get("a")!.finish).toBe("2026-11-16");
    const late = run([a], [], {}, { blockersClearAfter: 5 });
    expect(late.tasks.get("a")!.finish).toBe("2026-11-23");
    expect(late.assumptions.join(" ")).toMatch(/after 5 working days/);
  });

  it("forecasts milestone and project slip from the latest linked task", () => {
    const ms = milestone("p", { id: "ms", due_date: "2026-11-18" });
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 40, milestone_id: "ms" });
    const f = run([a], [], { milestones: [ms] });
    expect(f.milestones.get("ms")).toMatchObject({ finish: "2026-11-20", slipWorkingDays: 2, drivingTaskId: "a" });
    expect(f.projects.get("p")).toMatchObject({ finish: "2026-11-20", slipWorkingDays: -5 });
  });

  it("flags unassigned work and work that never fits", () => {
    const idle = member({ id: "idle", weekly_capacity_hours: 0 });
    const a = task("p", { id: "a", planned_hours: 8 });
    const b = task("p", { id: "b", assignee_id: "idle", planned_hours: 8 });
    const f = run([a, b], [], { members: [idle] });
    expect(f.tasks.get("a")!.flags).toContain("unassigned");
    expect(f.tasks.get("b")).toMatchObject({ finish: null });
    expect(f.tasks.get("b")!.flags).toContain("beyond_horizon");
    expect(f.projects.get("p")!.finish).toBeNull();
  });

  it("is deterministic", () => {
    const tasks = [task("p", { id: "x", assignee_id: "dev", planned_hours: 8 }), task("p", { id: "y", assignee_id: "dev", planned_hours: 8 })];
    expect([...run(tasks).tasks.values()]).toEqual([...run(tasks).tasks.values()]);
  });
});
