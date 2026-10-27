// Domain types mirroring supabase/migrations/0001_foundation.sql.
// `date` columns are "YYYY-MM-DD" strings; `timestamptz` columns are ISO strings.
// Postgres numerics are converted to numbers in lib/data (never in components).

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed"] as const;
export const BUDGET_CATEGORIES = ["labor", "vendor", "software", "travel", "other"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export interface Workspace {
  id: string;
  name: string;
  is_demo: boolean;
  reference_date: string | null;
  currency: string;
  default_hourly_rate: number;
  default_weekly_capacity: number;
}

export interface TeamMember {
  id: string;
  workspace_id: string;
  name: string;
  role_title: string;
  discipline: string;
  weekly_capacity_hours: number;
  hourly_cost: number | null;
  active: boolean;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  client_name: string;
  description: string;
  owner_member_id: string | null;
  status: ProjectStatus;
  start_date: string;
  target_date: string;
  budget: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  due_date: string;
  completed_at: string | null;
}

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  is_critical: boolean;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  planned_hours: number;
  actual_hours: number;
  remaining_hours: number | null;
  blocked_reason: string;
  blocked_until: string | null;
  completed_at: string | null;
  /** Set when scope was reduced; deferred tasks are excluded from every calculation. */
  deferred_at: string | null;
  updated_at: string;
}

export interface TaskDependency {
  project_id: string;
  task_id: string;
  depends_on_id: string;
}

export interface BudgetEntry {
  id: string;
  project_id: string;
  task_id: string | null;
  entry_date: string;
  amount: number;
  category: BudgetCategory;
  note: string;
}

export interface ActivityEvent {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  created_at: string;
}

/** Everything the engine needs to evaluate one workspace. Loaded once per request. */
export interface WorkspaceSnapshot {
  workspace: Workspace;
  members: TeamMember[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  dependencies: TaskDependency[];
  budgetEntries: BudgetEntry[];
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  labor: "Labor",
  vendor: "Vendor",
  software: "Software",
  travel: "Travel",
  other: "Other",
};
