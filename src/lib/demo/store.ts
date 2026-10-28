import { sha256Hex } from "@/lib/hash";
import { wouldCreateCycle } from "@/lib/engine/graph";
import { buildDemoDataset, DEMO_REFERENCE_DATE } from "./dataset";

// In-memory stand-in for the Supabase database, used in local demo mode
// (PROJECTPILOT_DATA_MODE=demo) and, in the browser, by the static GitHub Pages
// demo (persisted to localStorage via setDemoPersistence). It enforces the database behaviour the app relies
// on — defaults, the task completion trigger, updated_at, unique keys, same-project
// and acyclic dependencies, cascades — so every server action runs unchanged.
// Single-user and process-local: it resets when the server restarts. RLS is not
// emulated because the demo user is the only user.

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
export interface PgError { code: string; message: string }

export const DEMO_USER = { id: stableUuid("demo-user"), email: "demo@northwind.example", user_metadata: { full_name: "Alex Morgan" } };

/** Deterministic RFC 4122 v4-shaped UUID, so seeded ids are stable across restarts. */
export function stableUuid(key: string) {
  const h = sha256Hex(`projectpilot-demo:${key}`);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const nowIso = () => new Date().toISOString();
const randomUUID = () => globalThis.crypto.randomUUID();

const DEFAULTS: Record<string, () => Row> = {
  workspaces: () => ({ is_demo: false, reference_date: null, currency: "USD", default_hourly_rate: 120, default_weekly_capacity: 32, created_at: nowIso() }),
  workspace_members: () => ({ role: "member", created_at: nowIso() }),
  team_members: () => ({ role_title: "", discipline: "", weekly_capacity_hours: 40, hourly_cost: null, active: true, created_at: nowIso() }),
  projects: () => ({ client_name: "", description: "", owner_member_id: null, status: "active", methodology: "waterfall", budget: 0, archived_at: null, created_at: nowIso(), updated_at: nowIso() }),
  milestones: () => ({ completed_at: null, created_at: nowIso() }),
  sprints: () => ({ goal: "", created_at: nowIso() }),
  tasks: () => ({ milestone_id: null, description: "", status: "todo", priority: "medium", is_critical: false, assignee_id: null, start_date: null, due_date: null, planned_hours: 8, actual_hours: 0, remaining_hours: null, blocked_reason: "", blocked_until: null, completed_at: null, deferred_at: null, story_points: null, sprint_id: null, baseline_start: null, baseline_due: null, created_at: nowIso(), updated_at: nowIso() }),
  task_dependencies: () => ({ created_at: nowIso() }),
  budget_entries: () => ({ task_id: null, note: "", created_at: nowIso() }),
  activity_events: () => ({ project_id: null, entity_id: null, created_at: nowIso() }),
  risk_snapshots: () => ({ created_at: nowIso() }),
  simulations: () => ({ status: "draft", applied_at: null, applied_by: null, created_at: nowIso() }),
  ai_explanations: () => ({ usage: {}, created_at: nowIso() }),
  decision_briefs: () => ({ simulation_id: null, ai_meta: {}, created_at: nowIso(), updated_at: nowIso() }),
};

/** Composite keys that must be unique (mirrors primary keys / unique constraints). */
const UNIQUE: Record<string, string[][]> = {
  workspace_members: [["workspace_id", "user_id"]],
  task_dependencies: [["task_id", "depends_on_id"]],
  ai_explanations: [["workspace_id", "input_hash"]],
};

const TOUCH = new Set(["projects", "tasks", "decision_briefs"]);

function empty(): Tables {
  return Object.fromEntries(Object.keys(DEFAULTS).map((t) => [t, []]));
}

interface DemoState { tables: Tables; seeded: boolean }
const globalStore = globalThis as unknown as { __projectpilotDemo?: DemoState };

// ── Persistence and change notification (browser demo) ────────────────────────
export interface DemoPersistence {
  load(): Tables | null;
  save(tables: Tables): void;
}
let persistence: DemoPersistence | null = null;
const listeners = new Set<() => void>();
let version = 0;

/** Called once by the static build to keep the store in localStorage. */
export function setDemoPersistence(p: DemoPersistence) {
  persistence = p;
}
/** Persists the store and notifies subscribers; called after every write. */
export function commitDemo() {
  version++;
  if (globalStore.__projectpilotDemo) persistence?.save(globalStore.__projectpilotDemo.tables);
  listeners.forEach((l) => l());
}
export function subscribeDemo(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const demoVersion = () => version;

export function demoState(): DemoState {
  if (!globalStore.__projectpilotDemo) {
    const saved = persistence?.load();
    globalStore.__projectpilotDemo = saved ? { tables: { ...empty(), ...saved }, seeded: true } : { tables: empty(), seeded: false };
  }
  const state = globalStore.__projectpilotDemo;
  if (!state.seeded) {
    const wsId = stableUuid("workspace");
    state.tables.workspaces.push({ ...DEFAULTS.workspaces(), id: wsId, name: "", is_demo: true, reference_date: process.env.DEMO_REFERENCE_DATE || DEMO_REFERENCE_DATE, created_by: DEMO_USER.id });
    state.tables.workspace_members.push({ ...DEFAULTS.workspace_members(), workspace_id: wsId, user_id: DEMO_USER.id, role: "owner" });
    seedDemoWorkspace(state.tables, wsId);
    state.seeded = true;
    persistence?.save(state.tables);
  }
  return state;
}

/** Wipes and re-creates a demo workspace's data from the shared demo dataset. */
export function seedDemoWorkspace(tables: Tables, workspaceId: string): PgError | null {
  const ws = tables.workspaces.find((w) => w.id === workspaceId);
  if (!ws?.is_demo) return { code: "P0001", message: `seed_demo_workspace: workspace ${workspaceId} is not a demo workspace (or is not visible)` };
  const data = buildDemoDataset({ referenceDate: (ws.reference_date as string) ?? DEMO_REFERENCE_DATE, workspaceId, idFor: (k) => stableUuid(`${workspaceId}:${k}`), now: nowIso() });
  ws.name = data.workspace.name;
  for (const t of Object.keys(tables)) if (t !== "workspaces" && t !== "workspace_members" && t !== "ai_explanations") tables[t] = tables[t].filter((r) => r.workspace_id !== workspaceId);
  const add = (table: string, rows: object[]) => rows.forEach((r) => tables[table].push({ ...DEFAULTS[table](), ...(r as Row) }));
  add("team_members", data.members);
  add("projects", data.projects);
  add("milestones", data.milestones);
  add("sprints", data.sprints);
  add("tasks", data.tasks);
  add("task_dependencies", data.dependencies);
  add("budget_entries", data.budgetEntries);
  add("activity_events", data.activity);
  return null;
}

/** Applies defaults and the triggers/constraints the schema enforces on insert. */
export type Checked = { row: Row; error?: undefined } | { error: PgError; row?: undefined };

export function prepareInsert(tables: Tables, table: string, input: Row): Checked {
  const row: Row = { ...DEFAULTS[table]?.(), ...input };
  if (!("id" in row) && table !== "workspace_members" && table !== "task_dependencies") row.id = randomUUID();
  return applyRules(tables, table, row, null);
}

export function prepareUpdate(tables: Tables, table: string, before: Row, patch: Row): Checked {
  const row = { ...before, ...patch };
  if (TOUCH.has(table)) row.updated_at = nowIso();
  return applyRules(tables, table, row, before);
}

function applyRules(tables: Tables, table: string, row: Row, before: Row | null): Checked {
  for (const key of UNIQUE[table] ?? []) {
    const clash = tables[table].find((r) => r !== before && key.every((k) => r[k] === row[k]));
    if (clash) return { error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` } };
  }
  if (table === "tasks") {
    // sync_task_completion trigger
    if (row.status === "done") {
      row.completed_at ??= nowIso();
      row.remaining_hours = 0;
    } else row.completed_at = null;
    if (row.due_date && row.start_date && (row.due_date as string) < (row.start_date as string)) return { error: { code: "23514", message: "due date before start date" } };
    if (row.baseline_due && row.baseline_start && (row.baseline_due as string) < (row.baseline_start as string)) return { error: { code: "23514", message: "baseline due before baseline start" } };
    if (row.sprint_id && !tables.sprints.some((s) => s.id === row.sprint_id && s.project_id === row.project_id)) return { error: { code: "23503", message: "sprint must belong to the task's project" } };
    if (row.story_points !== null && row.story_points !== undefined && ((row.story_points as number) < 0 || (row.story_points as number) > 100)) return { error: { code: "23514", message: "story points out of range" } };
  }
  if (table === "task_dependencies") {
    if (row.task_id === row.depends_on_id) return { error: { code: "23514", message: "task cannot depend on itself" } };
    const sameProject = (id: unknown) => tables.tasks.some((t) => t.id === id && t.project_id === row.project_id);
    if (!sameProject(row.task_id) || !sameProject(row.depends_on_id)) return { error: { code: "23503", message: "dependency must link tasks of the same project" } };
    const edges = tables.task_dependencies.filter((d) => d !== before) as { task_id: string; depends_on_id: string }[];
    if (wouldCreateCycle(edges, row.task_id as string, row.depends_on_id as string)) {
      return { error: { code: "23514", message: "dependency_cycle: this dependency would create a circular chain" } };
    }
  }
  if (table === "projects" && (row.target_date as string) < (row.start_date as string)) return { error: { code: "23514", message: "target before start" } };
  if (table === "projects" && row.methodology !== "waterfall" && row.methodology !== "agile") return { error: { code: "23514", message: "invalid methodology" } };
  if (table === "sprints") {
    if ((row.end_date as string) < (row.start_date as string)) return { error: { code: "23514", message: "sprint ends before it starts" } };
    if (!tables.projects.some((p) => p.id === row.project_id && p.workspace_id === row.workspace_id)) return { error: { code: "23503", message: "sprint project not in workspace" } };
  }
  return { row };
}

/** ON DELETE behaviour of the foreign keys. */
export function cascadeDelete(tables: Tables, table: string, row: Row) {
  if (table === "tasks") {
    tables.task_dependencies = tables.task_dependencies.filter((d) => d.task_id !== row.id && d.depends_on_id !== row.id);
    tables.budget_entries.forEach((e) => e.task_id === row.id && (e.task_id = null));
  }
  if (table === "milestones") tables.tasks.forEach((t) => t.milestone_id === row.id && (t.milestone_id = null));
  if (table === "sprints") tables.tasks.forEach((t) => t.sprint_id === row.id && (t.sprint_id = null));
  if (table === "simulations") tables.decision_briefs.forEach((b) => b.simulation_id === row.id && (b.simulation_id = null));
}

/** create_workspace(p_name) */
export function createWorkspace(tables: Tables, name: string, userId: string): string {
  const id = randomUUID();
  tables.workspaces.push({ ...DEFAULTS.workspaces(), id, name, created_by: userId });
  tables.workspace_members.push({ ...DEFAULTS.workspace_members(), workspace_id: id, user_id: userId, role: "owner" });
  return id;
}
