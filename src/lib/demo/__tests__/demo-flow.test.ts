import { beforeAll, describe, expect, it, vi } from "vitest";

// Run the real server actions against the in-memory store with Next's request APIs mocked.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "pp_demo_session" ? { value: "1" } : undefined), set() {}, delete() {}, getAll: () => [] }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import { createProject, setProjectArchived } from "@/actions/projects";
import { addDependency, createTask, restoreTask, updateTaskProgress } from "@/actions/tasks";
import { applySimulation, saveSimulation } from "@/actions/simulations";
import { explainSimulation, generateBrief, updateBrief } from "@/actions/ai";
import { resetDemoWorkspace } from "@/actions/workspace";
import { addBudgetEntry } from "@/actions/budget";
import { assignTask, createSprint, deleteSprint, moveTask, setBaseline } from "@/actions/planning";
import { askCopilot, explainCopilot } from "@/actions/copilot";
import { getActiveMembership, loadWorkspaceSnapshot } from "@/lib/data/workspace";
import { analyzeWorkspace } from "@/lib/engine";
import { demoState } from "../store";

const tables = () => demoState().tables;
const fresh = async () => loadWorkspaceSnapshot((await getActiveMembership()).workspace);
const taskId = async (title: string) => (await fresh()).tasks.find((t) => t.title === title)!.id;
const memberId = async (name: string) => (await fresh()).members.find((m) => m.name === name)!.id;
const projectId = async (name: string) => (await fresh()).projects.find((p) => p.name === name)!.id;

beforeAll(() => {
  delete process.env.GEMINI_API_KEY; // AI must degrade gracefully, and tests make no network calls
  (globalThis as { __projectpilotDemo?: unknown }).__projectpilotDemo = undefined;
});

describe("demo flow through real server actions", () => {
  it("manages projects, tasks, dependencies and spend with activity history", async () => {
    const p = await createProject({ name: "Pilot project", client_name: "Acme", description: "", owner_member_id: "", status: "active", start_date: "2026-11-02", target_date: "2026-12-18", budget: "20000" });
    expect(p.ok).toBe(true);
    const pid = (p as { data: { id: string } }).data.id;
    const base = { description: "", status: "todo", priority: "high", is_critical: false, assignee_id: "", milestone_id: "", start_date: "", due_date: "", actual_hours: "0", remaining_hours: "", blocked_reason: "", blocked_until: "" } as const;
    const a = await createTask(pid, { ...base, title: "Design", planned_hours: "16" });
    const b = await createTask(pid, { ...base, title: "Build", planned_hours: "24" });
    const [ida, idb] = [a, b].map((r) => (r as { data: { id: string } }).data.id);
    expect(await addDependency(pid, { task_id: idb, depends_on_id: ida })).toEqual({ ok: true });
    expect(await addDependency(pid, { task_id: ida, depends_on_id: idb })).toEqual({ ok: false, error: "That dependency would create a circular chain." });
    expect((await updateTaskProgress(ida, { status: "done", actual_hours: 18, remaining_hours: "" })).ok).toBe(true);
    expect((await addBudgetEntry(pid, { entry_date: "2026-11-10", amount: "2400", category: "labor", note: "Week 1", task_id: "" })).ok).toBe(true);
    expect(await createTask(pid, { ...base, title: "", planned_hours: "8" })).toMatchObject({ ok: false, fieldErrors: { title: "Title is required" } });

    const analysis = analyzeWorkspace(await fresh()).projects.find((x) => x.project.id === pid)!;
    expect(analysis.progress.percent).toBe(40); // 16 of 40 planned hours earned
    expect(analysis.cost.actualCost).toBe(2400);
    const events = tables().activity_events.filter((e) => e.project_id === pid).map((e) => e.summary as string);
    expect(events.some((s) => s.includes("Dependency added"))).toBe(true);
    expect(events.some((s) => s.includes("status To do → Done"))).toBe(true);

    expect((await setProjectArchived(pid, true)).ok).toBe(true);
    expect(analyzeWorkspace(await fresh()).projects.some((x) => x.project.id === pid)).toBe(false);
  });

  it("simulates, saves and applies a reallocation only on approval", async () => {
    const erp = await projectId("Client ERP Implementation");
    const scenario = { kind: "reassign" as const, taskId: await taskId("System integration testing"), toMemberId: await memberId("Jordan Ruiz") };
    const tomId = await memberId("Tom Becker");

    const saved = await saveSimulation({ projectId: erp, name: "Jordan on SIT", scenario });
    expect(saved.ok).toBe(true);
    expect((await fresh()).tasks.find((t) => t.id === scenario.taskId)!.assignee_id).toBe(tomId); // saving changes nothing

    const before = analyzeWorkspace(await fresh()).forecast.projects.get(erp)!;
    const applied = await applySimulation({ projectId: erp, name: "Jordan on SIT", scenario, simulationId: (saved as { data: { id: string } }).data.id });
    expect(applied).toEqual({ ok: true });
    expect((await fresh()).tasks.find((t) => t.id === scenario.taskId)!.assignee_id).toBe(scenario.toMemberId);
    const after = analyzeWorkspace(await fresh()).forecast.projects.get(erp)!;
    expect([before.slipWorkingDays, after.slipWorkingDays]).toEqual([6, 3]);

    const sim = tables().simulations.find((s) => s.name === "Jordan on SIT")!;
    expect(sim).toMatchObject({ status: "applied" });
    expect(tables().risk_snapshots.some((r) => r.project_id === erp)).toBe(true);
    // Re-applying is rejected by validation (Jordan already owns it).
    expect(await applySimulation({ projectId: erp, name: "again", scenario })).toMatchObject({ ok: false, error: "Jordan Ruiz already owns this task." });
  });

  it("defers and restores scope", async () => {
    const web = await projectId("Client Website Migration");
    const forms = await taskId("Legacy form integrations");
    expect(await applySimulation({ projectId: web, name: "Defer forms", scenario: { kind: "scope", taskIds: [forms] } })).toEqual({ ok: true });
    expect(analyzeWorkspace(await fresh()).projects.find((p) => p.project.id === web)!.facts.tasks.some((t) => t.id === forms)).toBe(false);
    expect(await restoreTask(forms)).toEqual({ ok: true });
    expect((await fresh()).tasks.find((t) => t.id === forms)!.deferred_at).toBeNull();
  });

  it("creates a brief with calculated facts even when AI is unavailable, and keeps facts immutable on edit", async () => {
    const erp = await projectId("Client ERP Implementation");
    const explain = await explainSimulation({ projectId: erp, name: "x", scenario: { kind: "deadline", target: "project", targetId: erp, newDate: "2026-12-31" } });
    expect(explain).toMatchObject({ ok: false, error: { kind: "not_configured" } });

    const sim = tables().simulations.find((s) => s.name === "Jordan on SIT")!;
    const created = await generateBrief({ projectId: erp, simulationId: sim.id as string });
    expect(created.ok).toBe(true);
    const brief = tables().decision_briefs.at(-1)!;
    expect(brief.ai_meta).toMatchObject({ status: "unavailable" });
    expect((brief.facts as { scenario: { name: string } }).scenario.name).toBe("Jordan on SIT");
    const facts = JSON.stringify(brief.facts);

    const edited = await updateBrief(brief.id as string, { title: "ERP decision", narrative: { executiveSummary: "Written by the lead.", recommendation: "", risks: ["Vendor date may slip"], clientMessage: "" } });
    expect(edited).toEqual({ ok: true });
    expect(brief).toMatchObject({ title: "ERP decision", ai_meta: { edited: true } });
    expect(JSON.stringify(brief.facts)).toBe(facts);
  });

  it("runs Agile planning: sprints, board moves and backlog, without losing task data", async () => {
    const web = await projectId("Client Website Migration");
    expect((await fresh()).projects.find((p) => p.id === web)!.methodology).toBe("agile");
    const sp = await createSprint(web, { name: "Sprint 5", goal: "Hypercare", start_date: "2026-12-14", end_date: "2026-12-25" });
    expect(sp.ok).toBe(true);
    const sid = (sp as { data: { id: string } }).data.id;
    expect(await createSprint(web, { name: "Bad", goal: "", start_date: "2026-12-10", end_date: "2026-12-01" })).toMatchObject({ ok: false, fieldErrors: { end_date: expect.any(String) } });

    const redirects = await taskId("Redirect map & SEO checks");
    const before = (await fresh()).tasks.find((t) => t.id === redirects)!;
    expect((await moveTask(redirects, { sprintId: sid, status: "in_progress" })).ok).toBe(true);
    const moved = (await fresh()).tasks.find((t) => t.id === redirects)!;
    expect(moved).toMatchObject({ sprint_id: sid, status: "in_progress", story_points: before.story_points, planned_hours: before.planned_hours });

    // Deleting the sprint returns its work to the backlog; nothing is deleted.
    expect((await deleteSprint(sid)).ok).toBe(true);
    expect((await fresh()).tasks.find((t) => t.id === redirects)!.sprint_id).toBeNull();

    // A task cannot join another project's sprint.
    const erpSprint = await createSprint(await projectId("Client ERP Implementation"), { name: "Not agile", goal: "", start_date: "2026-11-16", end_date: "2026-11-27" });
    expect((await moveTask(redirects, { sprintId: (erpSprint as { data: { id: string } }).data.id })).ok).toBe(false);
  });

  it("captures a Waterfall baseline and reassigns work", async () => {
    const ops = await projectId("Operations Process Improvement");
    const r = await setBaseline(ops);
    expect(r.ok).toBe(true);
    for (const t of (await fresh()).tasks.filter((x) => x.project_id === ops)) expect([t.baseline_start, t.baseline_due]).toEqual([t.start_date, t.due_date]);
    const dash = await taskId("Dispatch reporting dashboard");
    expect((await assignTask(dash, await memberId("Jordan Ruiz"))).ok).toBe(true);
    expect((await fresh()).tasks.find((t) => t.id === dash)!.assignee_id).toBe(await memberId("Jordan Ruiz"));
  });

  it("answers Copilot questions from records and degrades gracefully without AI", async () => {
    const r = await askCopilot({ question: "Which team members are overloaded?" });
    expect(r).toMatchObject({ ok: true, answer: { query: { intent: "overloaded" } } });
    expect(await askCopilot({ question: "What is the capital of France?" })).toMatchObject({ ok: true, answer: null, unrecognised: true });
    expect(await askCopilot({ query: { intent: "delay" } })).toEqual({ ok: false, error: "Choose a milestone to model the delay." });
    const ai = await explainCopilot({ query: { intent: "at_risk" } });
    expect(ai).toMatchObject({ ok: false, error: { kind: "not_configured" } });
  });

  it("resets the demo workspace to the seeded scenario", async () => {
    expect(await resetDemoWorkspace()).toEqual({ ok: true });
    const a = analyzeWorkspace(await fresh());
    expect(a.forecast.projects.get(await projectId("Client ERP Implementation"))!.slipWorkingDays).toBe(6);
    expect((await fresh()).projects).toHaveLength(3);
  });
});
