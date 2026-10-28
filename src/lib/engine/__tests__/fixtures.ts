import type { BudgetEntry, Milestone, Project, Sprint, Task, TaskDependency, TeamMember, Workspace, WorkspaceSnapshot } from "@/lib/types";
import { buildDemoDataset, DEMO_REFERENCE_DATE } from "@/lib/demo/dataset";

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
    status: "active", methodology: "waterfall", start_date: "2026-11-02", target_date: "2026-12-18", budget: 0, archived_at: null,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides,
  };
}

export function task(projectId: string, overrides: Partial<Task> = {}): Task {
  return {
    id: nextId("t"), workspace_id: "ws", project_id: projectId, milestone_id: null, title: "Task", description: "",
    status: "todo", priority: "medium", is_critical: false, assignee_id: null, start_date: null, due_date: null,
    planned_hours: 8, actual_hours: 0, remaining_hours: null, blocked_reason: "", blocked_until: null, completed_at: null, deferred_at: null,
    story_points: null, sprint_id: null, baseline_start: null, baseline_due: null, updated_at: "2026-11-01T00:00:00Z", ...overrides,
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
  return { workspace: workspace(), members: [], projects: [], milestones: [], sprints: [], tasks: [], dependencies: [], budgetEntries: [], ...parts };
}

/** The demo portfolio (src/lib/demo/dataset.ts) with readable ids ("erp", "e_vendor", "jordan"). */
export function demoSnapshot(r = DEMO_REFERENCE_DATE): WorkspaceSnapshot {
  const { workspace, members, projects, milestones, sprints, tasks, dependencies, budgetEntries } = buildDemoDataset({ referenceDate: r });
  return { workspace, members, projects, milestones, sprints, tasks, dependencies, budgetEntries };
}

export function sprint(projectId: string, overrides: Partial<Sprint> = {}): Sprint {
  return { id: nextId("s"), workspace_id: "ws", project_id: projectId, name: "Sprint", goal: "", start_date: "2026-11-16", end_date: "2026-11-27", ...overrides };
}
