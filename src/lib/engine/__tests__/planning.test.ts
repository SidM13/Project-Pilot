import { describe, expect, it } from "vitest";
import { analyzeWorkspace } from "../index";
import { forecast } from "../forecast";
import { computeLoads, loadWindow } from "../capacity";
import { baselineVariance, computeAgile, criticalPath, OVERCOMMIT_PERCENT, sprintState, taskCosts, teamConflicts } from "../planning";
import { demoSnapshot, dep, entry, member, project, sprint, task, workspace } from "./fixtures";

const ref = "2026-11-16"; // Monday

describe("agile sprint metrics", () => {
  const s1 = sprint("p", { id: "s1", start_date: "2026-10-19", end_date: "2026-10-30" });
  const s2 = sprint("p", { id: "s2", start_date: "2026-11-02", end_date: "2026-11-13" });
  const s3 = sprint("p", { id: "s3", start_date: "2026-11-16", end_date: "2026-11-27" });
  const s4 = sprint("p", { id: "s4", start_date: "2026-11-30", end_date: "2026-12-11" });

  it("classifies sprints as completed, active or upcoming against the reference date", () => {
    expect([s1, s2, s3, s4].map((s) => sprintState(s, ref))).toEqual(["completed", "completed", "active", "upcoming"]);
    // The last day of a sprint still counts as active.
    expect(sprintState(sprint("p", { start_date: "2026-11-02", end_date: ref }), ref)).toBe("active");
  });

  it("averages completed points over finished sprints and flags commitments above velocity", () => {
    const tasks = [
      task("p", { sprint_id: "s1", story_points: 5, status: "done" }),
      task("p", { sprint_id: "s1", story_points: 3, status: "todo" }), // carried over: not completed in s1
      task("p", { sprint_id: "s2", story_points: 9, status: "done" }),
      task("p", { sprint_id: "s3", story_points: 13 }),
      task("p", { sprint_id: "s3", story_points: 8 }),
      task("p", { sprint_id: "s3", story_points: null }),
      task("p", { sprint_id: null, story_points: 2 }),
    ];
    const a = computeAgile([s3, s1, s4, s2], tasks, ref);
    expect(a.sprints.map((m) => m.sprint.id)).toEqual(["s1", "s2", "s3", "s4"]); // ordered by start
    expect(a.velocity).toBe(7); // (5 + 9) / 2
    expect(a.active?.committedPoints).toBe(21);
    expect(a.active?.unpointedTasks).toBe(1);
    expect(a.overcommit).toEqual({ committed: 21, velocity: 7, percentOver: 200 });
    expect(a.backlogPoints).toBe(2);
    expect(a.openPoints).toBe(3 + 13 + 8 + 2);
    expect(a.sprintsToFinish).toBe(Math.ceil(26 / 7));
  });

  it("does not flag a commitment within the overcommit tolerance, and has no velocity before a sprint ends", () => {
    const within = 10 * (1 + OVERCOMMIT_PERCENT / 100);
    const a = computeAgile([s2, s3], [task("p", { sprint_id: "s2", story_points: 10, status: "done" }), task("p", { sprint_id: "s3", story_points: within })], ref);
    expect(a.overcommit).toBeNull();
    const none = computeAgile([s3], [task("p", { sprint_id: "s3", story_points: 5 })], ref);
    expect(none.velocity).toBeNull();
    expect(none.sprintsToFinish).toBeNull();
    expect(none.overcommit).toBeNull();
  });

  it("matches the demo's Agile sample: Sprint 3 committed well above velocity", () => {
    const s = demoSnapshot();
    const a = computeAgile(s.sprints.filter((x) => x.project_id === "web"), s.tasks.filter((t) => t.project_id === "web"), ref);
    expect(a.velocity).toBe(6.5);
    expect(a.active?.sprint.name).toBe("Sprint 3");
    expect(a.active?.committedPoints).toBe(26);
    expect(a.overcommit?.percentOver).toBe(300);
    expect(a.backlogPoints).toBe(3);
  });
});

describe("critical path", () => {
  const ws = workspace();
  const dev = member({ id: "dev", weekly_capacity_hours: 40 });
  const p = project({ id: "p" });
  const run = (tasks: ReturnType<typeof task>[], deps: ReturnType<typeof dep>[]) => forecast({ workspace: ws, members: [dev], projects: [p], milestones: [], tasks, dependencies: deps }, ref);

  it("follows the latest-finishing upstream task back from the task that sets the finish", () => {
    const a = task("p", { id: "a", assignee_id: "dev", planned_hours: 8 });
    const b = task("p", { id: "b", assignee_id: null, planned_hours: 40 }); // long, unassigned → own resource
    const c = task("p", { id: "c", assignee_id: "dev", planned_hours: 8 });
    const deps = [dep("p", "c", "a"), dep("p", "c", "b")];
    const plan = run([a, b, c], deps);
    expect(criticalPath("p", [a, b, c], deps, plan).taskIds).toEqual(["b", "c"]);
  });

  it("explains why no path exists without dependencies or when everything is done", () => {
    const a = task("p", { id: "a", assignee_id: "dev" });
    expect(criticalPath("p", [a], [], run([a], [])).reason).toMatch(/dependencies/);
    const done = task("p", { id: "d", status: "done" });
    expect(criticalPath("p", [done], [dep("p", "d", "d0")], run([done], [])).reason).toMatch(/done/);
  });

  it("produces a dependency-connected chain ending at the ERP go-live in the demo", () => {
    const s = demoSnapshot();
    const analysis = analyzeWorkspace(s, ref);
    const erp = analysis.projects.find((x) => x.project.id === "erp")!;
    const cp = criticalPath("erp", erp.facts.tasks, erp.facts.dependencies, analysis.forecast);
    expect(cp.taskIds.at(-1)).toBe("e_golive");
    expect(cp.taskIds).toContain("e_uat");
    for (let i = 1; i < cp.taskIds.length; i++) {
      expect(erp.facts.dependencies.some((d) => d.task_id === cp.taskIds[i] && d.depends_on_id === cp.taskIds[i - 1])).toBe(true);
    }
  });
});

describe("baseline variance", () => {
  it("compares done tasks' completion and open tasks' forecast with the baseline due date", () => {
    const ws = workspace();
    const dev = member({ id: "dev" });
    const p = project({ id: "p" });
    const done = task("p", { id: "done", status: "done", completed_at: "2026-11-12T10:00:00Z", baseline_start: "2026-11-02", baseline_due: "2026-11-10", due_date: "2026-11-11" });
    const open = task("p", { id: "open", assignee_id: "dev", planned_hours: 24, baseline_due: "2026-11-16", due_date: "2026-11-17" });
    const plan = forecast({ workspace: ws, members: [dev], projects: [p], milestones: [], tasks: [done, open], dependencies: [] }, ref);
    expect(baselineVariance(done, plan)).toMatchObject({ dueShift: 1, finishVariance: 2, finishBasis: "actual" });
    // 24 h at 8 h/day from Mon Nov 16 → finishes Wed Nov 18: 2 working days after baseline.
    expect(baselineVariance(open, plan)).toMatchObject({ dueShift: 1, finishVariance: 2, finishBasis: "forecast" });
    expect(baselineVariance(task("p", { baseline_due: null }), plan).finishVariance).toBeNull();
  });
});

describe("task-level cost", () => {
  it("costs planned and remaining hours at the owner's rate and sums spend linked to the task", () => {
    const ws = workspace({ default_hourly_rate: 100 });
    const m = member({ id: "m", hourly_cost: 150 });
    const t1 = task("p", { id: "t1", assignee_id: "m", planned_hours: 10, actual_hours: 4, remaining_hours: 8 });
    const t2 = task("p", { id: "t2", assignee_id: null, planned_hours: 5 });
    const costs = taskCosts([t1, t2], [entry("p", 300, { task_id: "t1" }), entry("p", 200, { task_id: "t1" }), entry("p", 999)], new Map([["m", m]]), ws);
    expect(costs[0]).toMatchObject({ rate: 150, plannedCost: 1500, recordedCost: 500, costToComplete: 1200, defaultRate: false });
    expect(costs[1]).toMatchObject({ rate: 100, plannedCost: 500, recordedCost: 0, costToComplete: 500, defaultRate: true });
  });
});

describe("team conflicts", () => {
  it("reports overallocation, date clashes, inactive owners and late forecasts", () => {
    const ws = workspace();
    const busy = member({ id: "busy", name: "Busy", weekly_capacity_hours: 10 });
    const gone = member({ id: "gone", name: "Gone", active: false });
    const p = project({ id: "p" });
    const up = task("p", { id: "up", title: "Up", assignee_id: "busy", planned_hours: 40, start_date: ref, due_date: "2026-11-20" });
    const down = task("p", { id: "down", title: "Down", assignee_id: "gone", start_date: "2026-11-18", due_date: "2026-11-30" });
    const deps = [dep("p", "down", "up")];
    const members = [busy, gone];
    const plan = forecast({ workspace: ws, members, projects: [p], milestones: [], tasks: [up, down], dependencies: deps }, ref);
    const loads = computeLoads([up, down], members, ws, loadWindow(ref));
    const kinds = teamConflicts([up, down], deps, new Map(members.map((m) => [m.id, m])), loads, plan).map((c) => `${c.kind}:${c.taskId ?? c.memberId}`);
    expect(kinds).toContain("overallocated:busy");
    expect(kinds).toContain("starts_before_upstream_due:down");
    expect(kinds).toContain("inactive_owner:down");
    expect(kinds).toContain("forecast_after_due:up");
  });
});
