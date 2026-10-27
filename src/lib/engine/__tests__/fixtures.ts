import type { BudgetEntry, Milestone, Project, Task, TaskDependency, TeamMember, Workspace, WorkspaceSnapshot } from "@/lib/types";
import { addDays } from "../dates";

// Builders with sensible defaults so each test states only what matters.

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: "ws", name: "Test", is_demo: false, reference_date: null, currency: "USD", default_hourly_rate: 100, default_weekly_capacity: 40, ...overrides };
}

export function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return { id: nextId("m"), workspace_id: "ws", name: "Member", role_title: "", discipline: "Engineering", weekly_capacity_hours: 40, hourly_cost: 100, active: true, ...overrides };
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId("p"), workspace_id: "ws", name: "Project", client_name: "Client", description: "", owner_member_id: null,
    status: "active", start_date: "2026-11-02", target_date: "2026-12-18", budget: 0, archived_at: null,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides,
  };
}

export function task(projectId: string, overrides: Partial<Task> = {}): Task {
  return {
    id: nextId("t"), workspace_id: "ws", project_id: projectId, milestone_id: null, title: "Task", description: "",
    status: "todo", priority: "medium", is_critical: false, assignee_id: null, start_date: null, due_date: null,
    planned_hours: 8, actual_hours: 0, remaining_hours: null, blocked_reason: "", completed_at: null,
    updated_at: "2026-11-01T00:00:00Z", ...overrides,
  };
}

export function milestone(projectId: string, overrides: Partial<Milestone> = {}): Milestone {
  return { id: nextId("ms"), workspace_id: "ws", project_id: projectId, name: "Milestone", due_date: "2026-12-01", completed_at: null, ...overrides };
}

export function dep(projectId: string, taskId: string, dependsOnId: string): TaskDependency {
  return { project_id: projectId, task_id: taskId, depends_on_id: dependsOnId };
}

export function entry(projectId: string, amount: number, overrides: Partial<BudgetEntry> = {}): BudgetEntry {
  return { id: nextId("b"), project_id: projectId, task_id: null, entry_date: "2026-11-01", amount, category: "labor", note: "", ...overrides };
}

export function snapshot(parts: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return { workspace: workspace(), members: [], projects: [], milestones: [], tasks: [], dependencies: [], budgetEntries: [], ...parts };
}

/**
 * TypeScript mirror of supabase/migrations/0002_demo_seed.sql.
 * Keep the two in sync: demo-scenario tests assert the presentation narrative.
 */
export function demoSnapshot(r = "2026-11-16"): WorkspaceSnapshot {
  const d = (offset: number) => addDays(r, offset);
  const done = (offset: number) => `${d(offset)}T17:00:00Z`;
  const ws = workspace({ is_demo: true, reference_date: r, default_hourly_rate: 120, default_weekly_capacity: 32 });
  const m = (id: string, name: string, discipline: string, cap: number, cost: number) =>
    member({ id, name, discipline, weekly_capacity_hours: cap, hourly_cost: cost });
  const members = [
    m("elena", "Elena Rossi", "Delivery", 40, 150),
    m("marcus", "Marcus Lee", "Engineering", 40, 135),
    m("priya", "Priya Shah", "Engineering", 40, 130),
    m("daniel", "Daniel Okafor", "Delivery", 40, 140),
    m("maya", "Maya Chen", "Engineering", 40, 115),
    m("jordan", "Jordan Ruiz", "Engineering", 40, 105),
    m("aisha", "Aisha Khan", "Analysis", 40, 110),
    m("tom", "Tom Becker", "Quality", 24, 95),
  ];

  type T = [id: string, ms: string, title: string, status: Task["status"], priority: Task["priority"], critical: boolean, who: string, start: number, due: number, planned: number, actual: number, remaining: number | null, completed?: number, blocked?: string];
  const tasksFor = (pid: string, rows: T[]) =>
    rows.map(([id, ms, title, status, priority, critical, who, start, due, planned, actual, remaining, completed, blocked]) =>
      task(pid, {
        id, milestone_id: ms, title, status, priority, is_critical: critical, assignee_id: who, start_date: d(start), due_date: d(due),
        planned_hours: planned, actual_hours: actual, remaining_hours: status === "done" ? 0 : remaining,
        completed_at: completed !== undefined ? done(completed) : null, blocked_reason: blocked ?? "",
      }),
    );

  const erp = project({ id: "erp", name: "Client ERP Implementation", client_name: "Halden Manufacturing", owner_member_id: "elena", start_date: d(-70), target_date: d(32), budget: 148000 });
  const web = project({ id: "web", name: "Client Website Migration", client_name: "Brightline Health", owner_member_id: "maya", start_date: d(-42), target_date: d(25), budget: 64000 });
  const ops = project({ id: "ops", name: "Operations Process Improvement", client_name: "Calder Logistics", owner_member_id: "aisha", start_date: d(-49), target_date: d(18), budget: 31200 });

  const milestones: Milestone[] = [
    milestone("erp", { id: "erp_m1", name: "Solution design sign-off", due_date: d(-45), completed_at: done(-46) }),
    milestone("erp", { id: "erp_m2", name: "Data migration complete", due_date: d(11) }),
    milestone("erp", { id: "erp_m3", name: "UAT sign-off", due_date: d(25) }),
    milestone("erp", { id: "erp_m4", name: "Go-live", due_date: d(32) }),
    milestone("web", { id: "web_m1", name: "Content freeze", due_date: d(-10), completed_at: done(-10) }),
    milestone("web", { id: "web_m2", name: "Staging site complete", due_date: d(9) }),
    milestone("web", { id: "web_m3", name: "Public launch", due_date: d(25) }),
    milestone("ops", { id: "ops_m1", name: "Current-state assessment", due_date: d(-31), completed_at: done(-31) }),
    milestone("ops", { id: "ops_m2", name: "Future-state design approved", due_date: d(-3), completed_at: done(-4) }),
    milestone("ops", { id: "ops_m3", name: "Rollout complete", due_date: d(18) }),
  ];

  const tasks = [
    ...tasksFor("erp", [
      ["e_req", "erp_m1", "Requirements & process mapping", "done", "high", false, "daniel", -70, -52, 60, 64, null, -53],
      ["e_design", "erp_m1", "Solution design", "done", "high", false, "daniel", -56, -46, 48, 52, null, -47],
      ["e_vendor", "erp_m2", "Kestrel WMS vendor integration", "blocked", "critical", true, "marcus", -28, -3, 80, 58, 30, undefined, "Kestrel has not delivered sandbox credentials for the inventory endpoint."],
      ["e_monitor", "erp_m2", "Interface error handling & monitoring", "in_progress", "high", false, "marcus", -7, 4, 32, 8, 24],
      ["e_extract", "erp_m2", "Legacy data extraction & cleansing", "in_progress", "high", true, "priya", -21, 4, 56, 40, 16],
      ["e_migrate", "erp_m2", "Database migration (inventory & orders)", "todo", "critical", true, "priya", 0, 9, 40, 0, null],
      ["e_finance", "erp_m3", "Finance module configuration", "in_progress", "high", false, "daniel", -14, 8, 64, 36, 28],
      ["e_sit", "erp_m3", "System integration testing", "todo", "high", true, "tom", 14, 18, 32, 0, null],
      ["e_uat", "erp_m3", "User acceptance testing", "todo", "critical", true, "elena", 21, 25, 24, 0, null],
      ["e_rehearse", "erp_m4", "Cutover rehearsal", "todo", "high", true, "marcus", 28, 30, 16, 0, null],
      ["e_golive", "erp_m4", "Go-live & hypercare", "todo", "critical", true, "daniel", 31, 32, 16, 0, null],
    ]),
    ...tasksFor("web", [
      ["w_audit", "web_m1", "Content audit & information architecture", "done", "medium", false, "jordan", -42, -31, 40, 38, null, -31],
      ["w_design", "web_m1", "Design system & page templates", "done", "high", false, "maya", -35, -17, 60, 66, null, -18],
      ["w_build", "web_m2", "Template build in headless CMS", "in_progress", "critical", true, "maya", -14, 4, 80, 44, 40],
      ["w_content", "web_m2", "Content migration (240 pages)", "in_progress", "high", true, "maya", -7, 8, 56, 8, 48],
      ["w_forms", "web_m2", "Legacy form integrations", "todo", "high", false, "marcus", 0, 8, 32, 0, null],
      ["w_redirects", "web_m3", "Redirect map & SEO checks", "todo", "medium", false, "jordan", 7, 15, 20, 0, null],
      ["w_qa", "web_m3", "Accessibility & QA pass", "todo", "high", true, "tom", 14, 18, 24, 0, null],
      ["w_launch", "web_m3", "Launch & DNS cutover", "todo", "critical", true, "marcus", 23, 25, 8, 0, null],
    ]),
    ...tasksFor("ops", [
      ["o_interviews", "ops_m1", "Stakeholder interviews", "done", "medium", false, "aisha", -49, -38, 40, 42, null, -38],
      ["o_asis", "ops_m1", "As-is process mapping", "done", "high", false, "aisha", -42, -31, 48, 50, null, -31],
      ["o_tobe", "ops_m2", "Future-state process design", "done", "high", true, "aisha", -28, -4, 40, 44, null, -4],
      ["o_sop", "ops_m3", "SOP documentation", "in_progress", "high", true, "aisha", -7, 9, 32, 14, 18],
      ["o_dash", "ops_m3", "Dispatch reporting dashboard", "in_progress", "medium", false, "maya", -7, 11, 32, 8, 24],
      ["o_train", "ops_m3", "Shift training sessions", "todo", "high", true, "aisha", 14, 16, 16, 0, null],
      ["o_rollout", "ops_m3", "Rollout & handover", "todo", "high", true, "elena", 17, 18, 8, 0, null],
    ]),
  ];

  const edges: [string, string, string][] = [
    ["erp", "e_design", "e_req"], ["erp", "e_vendor", "e_design"], ["erp", "e_monitor", "e_design"], ["erp", "e_extract", "e_design"],
    ["erp", "e_migrate", "e_vendor"], ["erp", "e_migrate", "e_extract"], ["erp", "e_finance", "e_design"], ["erp", "e_sit", "e_migrate"],
    ["erp", "e_sit", "e_finance"], ["erp", "e_sit", "e_monitor"], ["erp", "e_uat", "e_sit"], ["erp", "e_rehearse", "e_uat"], ["erp", "e_golive", "e_rehearse"],
    ["web", "w_design", "w_audit"], ["web", "w_build", "w_design"], ["web", "w_content", "w_design"], ["web", "w_forms", "w_design"],
    ["web", "w_qa", "w_build"], ["web", "w_qa", "w_content"], ["web", "w_launch", "w_qa"], ["web", "w_launch", "w_redirects"], ["web", "w_launch", "w_forms"],
    ["ops", "o_asis", "o_interviews"], ["ops", "o_tobe", "o_asis"], ["ops", "o_sop", "o_tobe"], ["ops", "o_dash", "o_tobe"],
    ["ops", "o_train", "o_sop"], ["ops", "o_rollout", "o_train"], ["ops", "o_rollout", "o_dash"],
  ];

  const budgetEntries = [
    ...[72000, 15000, 16240, 9800, 8270, 3400].map((a) => entry("erp", a)),
    ...[11580, 5980, 6200, 1850].map((a) => entry("web", a)),
    ...[10120, 7300, 2200, 1400].map((a) => entry("ops", a)),
  ];

  return snapshot({
    workspace: ws, members, projects: [erp, web, ops], milestones, tasks,
    dependencies: edges.map(([p, a, b]) => dep(p, a, b)), budgetEntries,
  });
}
