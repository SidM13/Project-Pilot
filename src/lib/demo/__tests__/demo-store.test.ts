import { beforeEach, describe, expect, it } from "vitest";
import { analyzeWorkspace } from "@/lib/engine";
import type { WorkspaceSnapshot } from "@/lib/types";
import { createDemoClient } from "../client";
import { DEMO_USER, demoState, stableUuid } from "../store";

const db = createDemoClient(true);
const ws = stableUuid("workspace");
const reset = () => {
  (globalThis as { __projectpilotDemo?: unknown }).__projectpilotDemo = undefined;
  demoState();
};

async function snapshot(): Promise<WorkspaceSnapshot> {
  const all = async (t: string) => (await db.from(t).select("*").eq("workspace_id", ws)).data as never[];
  const { data: workspace } = await db.from("workspaces").select("*").eq("id", ws).single();
  return { workspace: workspace as never, members: await all("team_members"), projects: await all("projects"), milestones: await all("milestones"), sprints: await all("sprints"), tasks: await all("tasks"), dependencies: await all("task_dependencies"), budgetEntries: await all("budget_entries") };
}

describe("demo store", () => {
  beforeEach(reset);

  it("seeds the same scenario the engine tests assert, with stable UUIDs", async () => {
    const a = analyzeWorkspace(await snapshot());
    expect(a.decisions[0].problem).toMatch(/Kestrel WMS vendor integration/);
    expect(a.decisions[0].impact?.label).toBe('"Data migration complete" forecast 7 working days late if the blocker clears on Nov 26 as expected');
    expect(a.projects.map((p) => p.health.status).sort()).toEqual(["at_risk", "critical", "on_track"]);
    expect(stableUuid("x")).toBe(stableUuid("x"));
    expect(stableUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("supports the embedded membership query used by the app", async () => {
    const { data } = await db.from("workspace_members").select("role, workspace:workspaces(id, name, is_demo)").eq("user_id", DEMO_USER.id);
    expect(data).toEqual([{ role: "owner", workspace: { id: ws, name: "Demo — Northwind Advisory", is_demo: true } }]);
  });

  it("applies defaults, the completion trigger and updated_at", async () => {
    const { data: p } = await db.from("projects").select("id").eq("workspace_id", ws).limit(1).single();
    const { data: t } = await db.from("tasks").insert({ workspace_id: ws, project_id: (p as { id: string }).id, title: "New" }).select("*").single();
    expect(t).toMatchObject({ status: "todo", planned_hours: 8, completed_at: null, deferred_at: null });
    const { data: done } = await db.from("tasks").update({ status: "done", remaining_hours: 5 }).eq("id", (t as { id: string }).id).select("completed_at, remaining_hours").single();
    expect(done).toMatchObject({ remaining_hours: 0 });
    expect((done as { completed_at: string }).completed_at).toBeTruthy();
  });

  it("enforces dependency rules like the database", async () => {
    const s = await snapshot();
    const [a, b] = s.tasks.filter((t) => t.project_id === s.projects[0].id);
    const other = s.tasks.find((t) => t.project_id !== s.projects[0].id)!;
    const edge = { workspace_id: ws, project_id: s.projects[0].id };
    expect((await db.from("task_dependencies").insert({ ...edge, task_id: b.id, depends_on_id: a.id })).error?.code).toBe("23505"); // already seeded
    expect((await db.from("task_dependencies").insert({ ...edge, task_id: a.id, depends_on_id: b.id })).error?.message).toMatch(/^dependency_cycle/);
    expect((await db.from("task_dependencies").insert({ ...edge, task_id: a.id, depends_on_id: other.id })).error?.code).toBe("23503");
  });

  it("cascades task deletes to dependencies and unlinks spend", async () => {
    const s = await snapshot();
    const vendor = s.tasks.find((t) => t.title.startsWith("Kestrel"))!;
    await db.from("budget_entries").update({ task_id: vendor.id }).eq("id", s.budgetEntries[0].id);
    const { data } = await db.from("tasks").delete().eq("id", vendor.id).select("title").single();
    expect(data).toEqual({ title: vendor.title });
    const after = await snapshot();
    expect(after.dependencies.some((d) => d.task_id === vendor.id || d.depends_on_id === vendor.id)).toBe(false);
    expect(after.budgetEntries.find((e) => e.id === s.budgetEntries[0].id)?.task_id).toBeNull();
  });

  it("matches PostgREST results for single, maybeSingle, counts and ordering", async () => {
    expect((await db.from("tasks").select("id").eq("id", "nope").single()).error?.code).toBe("PGRST116");
    expect((await db.from("tasks").select("id").eq("id", "nope").maybeSingle()).data).toBeNull();
    const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    expect(count).toBe(26);
    const { data } = await db.from("milestones").select("due_date").eq("workspace_id", ws).order("due_date");
    const dates = (data as { due_date: string }[]).map((m) => m.due_date);
    expect(dates).toEqual([...dates].sort());
    expect((await db.from("nonexistent").select("*")).error?.code).toBe("42P01");
  });

  it("resets the demo workspace through the seed RPC and refuses non-demo workspaces", async () => {
    await db.from("projects").update({ name: "Renamed" }).eq("workspace_id", ws);
    expect((await db.rpc("seed_demo_workspace", { ws })).error).toBeNull();
    expect((await snapshot()).projects.map((p) => p.name)).toContain("Client ERP Implementation");
    const { data: own } = await db.rpc("create_workspace", { p_name: "Real firm" });
    expect((await db.rpc("seed_demo_workspace", { ws: own })).error?.message).toMatch(/not a demo workspace/);
  });

  it("requires a session", async () => {
    const anon = createDemoClient(false);
    expect((await anon.auth.getUser()).data.user).toBeNull();
    expect((await anon.rpc("create_workspace", { p_name: "x" })).error?.code).toBe("42501");
  });
});
