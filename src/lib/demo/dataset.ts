import type { ActivityEvent, BudgetEntry, Milestone, Project, Task, TaskDependency, TeamMember, Workspace } from "@/lib/types";
import { addDays } from "@/lib/engine/dates";

// The Northwind Advisory demonstration portfolio — fictional clients and people.
// Single TypeScript source for the demo: the local demo store seeds from it, and the
// engine's demo-scenario tests run against it. supabase/migrations/0002_demo_seed.sql
// mirrors it for database-backed demos; keep the two in sync.
//
// Every date is an offset from the reference date, so moving it shifts the scenario.

export const DEMO_REFERENCE_DATE = "2026-11-16"; // Monday
export const DEMO_WORKSPACE_NAME = "Demo — Northwind Advisory";

export interface DemoDataset {
  workspace: Workspace;
  members: TeamMember[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  dependencies: (TaskDependency & { workspace_id: string })[];
  budgetEntries: (BudgetEntry & { workspace_id: string })[];
  activity: (ActivityEvent & { workspace_id: string })[];
}

export interface DemoDatasetOptions {
  referenceDate?: string;
  /** Maps a readable key ("erp", "e_vendor") to a row id. Tests use the key itself; the store uses UUIDs. */
  idFor?: (key: string) => string;
  workspaceId?: string;
  /** Timestamp used for created_at/updated_at of seeded rows. */
  now?: string;
}

export function buildDemoDataset(options: DemoDatasetOptions = {}): DemoDataset {
  const r = options.referenceDate ?? DEMO_REFERENCE_DATE;
  const id = options.idFor ?? ((k: string) => k);
  const ws = options.workspaceId ?? id("workspace");
  const now = options.now ?? `${r}T08:00:00Z`;
  const d = (offset: number) => addDays(r, offset);
  const at = (offset: number, hour = 17) => `${d(offset)}T${String(hour).padStart(2, "0")}:00:00Z`;

  const workspace: Workspace = { id: ws, name: DEMO_WORKSPACE_NAME, is_demo: true, reference_date: r, currency: "USD", default_hourly_rate: 120, default_weekly_capacity: 32 };

  const member = (key: string, name: string, role_title: string, discipline: string, weekly_capacity_hours: number, hourly_cost: number): TeamMember => ({
    id: id(key), workspace_id: ws, name, role_title, discipline, weekly_capacity_hours, hourly_cost, active: true,
  });
  const members = [
    member("elena", "Elena Rossi", "Engagement Manager", "Delivery", 40, 150),
    member("marcus", "Marcus Lee", "Integration Engineer", "Engineering", 40, 135),
    member("priya", "Priya Shah", "Data Engineer", "Engineering", 40, 130),
    member("daniel", "Daniel Okafor", "ERP Consultant", "Delivery", 40, 140),
    member("maya", "Maya Chen", "Front-end Lead", "Engineering", 40, 115),
    member("jordan", "Jordan Ruiz", "Web Developer", "Engineering", 40, 105),
    member("aisha", "Aisha Khan", "Process Analyst", "Analysis", 40, 110),
    member("tom", "Tom Becker", "QA Analyst", "Quality", 24, 95),
  ];

  const project = (key: string, name: string, client_name: string, description: string, owner: string, start: number, target: number, budget: number): Project => ({
    id: id(key), workspace_id: ws, name, client_name, description, owner_member_id: id(owner), status: "active",
    start_date: d(start), target_date: d(target), budget, archived_at: null, created_at: now, updated_at: now,
  });
  const projects = [
    project("erp", "Client ERP Implementation", "Halden Manufacturing", "Replace Halden's legacy inventory and finance system with a cloud ERP, including the Kestrel WMS integration and a full data migration.", "elena", -70, 32, 148000),
    project("web", "Client Website Migration", "Brightline Health", "Move Brightline's 240-page patient website from a legacy CMS to a headless CMS with a new template system.", "maya", -42, 25, 64000),
    project("ops", "Operations Process Improvement", "Calder Logistics", "Redesign Calder's order-to-dispatch process, document the new SOPs and train three warehouse shifts.", "aisha", -49, 18, 31200),
  ];

  const milestone = (key: string, projectKey: string, name: string, due: number, completed?: number): Milestone => ({
    id: id(key), workspace_id: ws, project_id: id(projectKey), name, due_date: d(due), completed_at: completed === undefined ? null : at(completed),
  });
  const milestones = [
    milestone("erp_m1", "erp", "Solution design sign-off", -45, -46),
    milestone("erp_m2", "erp", "Data migration complete", 11),
    milestone("erp_m3", "erp", "UAT sign-off", 25),
    milestone("erp_m4", "erp", "Go-live", 32),
    milestone("web_m1", "web", "Content freeze", -10, -10),
    milestone("web_m2", "web", "Staging site complete", 9),
    milestone("web_m3", "web", "Public launch", 25),
    milestone("ops_m1", "ops", "Current-state assessment", -31, -31),
    milestone("ops_m2", "ops", "Future-state design approved", -3, -4),
    milestone("ops_m3", "ops", "Rollout complete", 18),
  ];

  type Row = [key: string, ms: string, title: string, status: Task["status"], priority: Task["priority"], critical: boolean, who: string, start: number, due: number, planned: number, actual: number, remaining: number | null, extra?: Partial<Pick<Task, "description" | "blocked_reason">> & { completed?: number; blockedUntil?: number }];
  const tasksFor = (projectKey: string, rows: Row[]) =>
    rows.map(([key, ms, title, status, priority, critical, who, start, due, planned, actual, remaining, extra = {}]): Task => ({
      id: id(key), workspace_id: ws, project_id: id(projectKey), milestone_id: id(ms), title, description: extra.description ?? "", status, priority,
      is_critical: critical, assignee_id: id(who), start_date: d(start), due_date: d(due), planned_hours: planned, actual_hours: actual,
      remaining_hours: status === "done" ? 0 : remaining, blocked_reason: extra.blocked_reason ?? "",
      blocked_until: extra.blockedUntil === undefined ? null : d(extra.blockedUntil),
      completed_at: extra.completed === undefined ? null : at(extra.completed), deferred_at: null, updated_at: now,
    }));

  const tasks = [
    ...tasksFor("erp", [
      ["e_req", "erp_m1", "Requirements & process mapping", "done", "high", false, "daniel", -70, -52, 60, 64, null, { completed: -53 }],
      ["e_design", "erp_m1", "Solution design", "done", "high", false, "daniel", -56, -46, 48, 52, null, { completed: -47 }],
      ["e_vendor", "erp_m2", "Kestrel WMS vendor integration", "blocked", "critical", true, "marcus", -28, -3, 80, 58, 30, {
        description: "Build and test the inventory and shipment sync between the ERP and Kestrel WMS.",
        blocked_reason: "Kestrel has not delivered sandbox credentials for the inventory endpoint. After two follow-ups they committed to the date below.",
        blockedUntil: 10,
      }],
      ["e_monitor", "erp_m2", "Interface error handling & monitoring", "in_progress", "high", false, "marcus", -7, 4, 32, 8, 24],
      ["e_extract", "erp_m2", "Legacy data extraction & cleansing", "in_progress", "high", true, "priya", -21, 4, 56, 40, 16, { description: "Extract 14 years of inventory and order history; de-duplicate ~9% of item master records." }],
      ["e_migrate", "erp_m2", "Database migration (inventory & orders)", "todo", "critical", true, "priya", 0, 9, 40, 0, null, { description: "Load cleansed data into the ERP and reconcile stock balances against the WMS." }],
      ["e_finance", "erp_m3", "Finance module configuration", "in_progress", "high", false, "daniel", -14, 8, 64, 36, 28],
      ["e_sit", "erp_m3", "System integration testing", "todo", "high", true, "tom", 14, 18, 32, 0, null],
      ["e_uat", "erp_m3", "User acceptance testing", "todo", "critical", true, "elena", 21, 25, 24, 0, null],
      ["e_rehearse", "erp_m4", "Cutover rehearsal", "todo", "high", true, "marcus", 28, 30, 16, 0, null],
      ["e_golive", "erp_m4", "Go-live & hypercare", "todo", "critical", true, "daniel", 31, 32, 16, 0, null],
    ]),
    ...tasksFor("web", [
      ["w_audit", "web_m1", "Content audit & information architecture", "done", "medium", false, "jordan", -42, -31, 40, 38, null, { completed: -31 }],
      ["w_design", "web_m1", "Design system & page templates", "done", "high", false, "maya", -35, -17, 60, 66, null, { completed: -18 }],
      ["w_build", "web_m2", "Template build in headless CMS", "in_progress", "critical", true, "maya", -14, 4, 80, 44, 40],
      ["w_content", "web_m2", "Content migration (240 pages)", "in_progress", "high", true, "maya", -7, 8, 56, 8, 48],
      ["w_forms", "web_m2", "Legacy form integrations", "todo", "high", false, "marcus", 0, 8, 32, 0, null],
      ["w_redirects", "web_m3", "Redirect map & SEO checks", "todo", "medium", false, "jordan", 7, 15, 20, 0, null],
      ["w_qa", "web_m3", "Accessibility & QA pass", "todo", "high", true, "tom", 14, 18, 24, 0, null],
      ["w_launch", "web_m3", "Launch & DNS cutover", "todo", "critical", true, "marcus", 23, 25, 8, 0, null],
    ]),
    ...tasksFor("ops", [
      ["o_interviews", "ops_m1", "Stakeholder interviews", "done", "medium", false, "aisha", -49, -38, 40, 42, null, { completed: -38 }],
      ["o_asis", "ops_m1", "As-is process mapping", "done", "high", false, "aisha", -42, -31, 48, 50, null, { completed: -31 }],
      ["o_tobe", "ops_m2", "Future-state process design", "done", "high", true, "aisha", -28, -4, 40, 44, null, { completed: -4 }],
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
  const dependencies = edges.map(([p, t, u]) => ({ workspace_id: ws, project_id: id(p), task_id: id(t), depends_on_id: id(u) }));

  type Spend = [projectKey: string, offset: number, amount: number, category: BudgetEntry["category"], note: string];
  const spend: Spend[] = [
    ["erp", -66, 72000, "software", "Cloud ERP subscription — year one"],
    ["erp", -40, 15000, "software", "Data migration tooling licence"],
    ["erp", -47, 16240, "labor", "Requirements and design (116 h)"],
    ["erp", -17, 9800, "labor", "October build effort"],
    ["erp", -3, 8270, "labor", "November build effort to date"],
    ["erp", -35, 3400, "travel", "On-site discovery workshops"],
    ["web", -30, 11580, "labor", "Audit, IA and design system (104 h)"],
    ["web", -3, 5980, "labor", "November build effort to date"],
    ["web", -38, 6200, "software", "Headless CMS — annual plan"],
    ["web", -20, 1850, "vendor", "Stock photography licences"],
    ["ops", -30, 10120, "labor", "Assessment phase (92 h)"],
    ["ops", -4, 7300, "labor", "Design and documentation to date"],
    ["ops", -36, 2200, "travel", "Site visits — three warehouses"],
    ["ops", -25, 1400, "other", "Workshop facility hire"],
  ];
  const budgetEntries = spend.map(([p, offset, amount, category, note], i) => ({
    id: id(`budget_${i}`), workspace_id: ws, project_id: id(p), task_id: null, entry_date: d(offset), amount, category, note,
  }));

  const activity = [
    ["erp", "task", "e_vendor", "status_changed", "Kestrel WMS vendor integration marked Blocked: vendor committed to deliver credentials in 10 days", -5, 10],
    ["erp", "task", "e_extract", "hours_logged", "Legacy data extraction & cleansing: 40 h actual, 16 h remaining", -3, 16],
    ["web", "task", "w_content", "hours_logged", "Content migration (240 pages): 8 h actual, 48 h remaining", -3, 15],
    ["ops", "milestone", "ops_m2", "completed", "Milestone completed: Future-state design approved", -4, 17],
  ].map(([p, entity_type, entity, action, summary, offset, hour], i) => ({
    id: id(`activity_${i}`), workspace_id: ws, project_id: id(p as string), actor_id: null, entity_type: entity_type as string, entity_id: id(entity as string),
    action: action as string, summary: summary as string, created_at: at(offset as number, hour as number),
  }));

  return { workspace, members, projects, milestones, tasks, dependencies, budgetEntries, activity };
}
