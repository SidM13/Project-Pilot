import type { ServerClient } from "@/lib/supabase/server";
import type { ActivityEvent, BudgetEntry, Milestone, Project, Sprint, Task, TaskDependency, TeamMember, Workspace, WorkspaceSnapshot } from "@/lib/types";

// Query logic shared by the server data layer (lib/data/workspace.ts) and the static
// demo's browser data layer (src/static/data/workspace.ts). Pure: no cookies, caching
// or redirects. Postgres numerics are converted to numbers here.

export type MembershipRole = "owner" | "admin" | "member";

export async function fetchMemberships(supabase: ServerClient, userId: string): Promise<{ workspace: Workspace; role: MembershipRole }[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(id, name, is_demo, reference_date, currency, default_hourly_rate, default_weekly_capacity)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.workspace)
    .map((row) => ({ role: row.role as MembershipRole, workspace: normalizeWorkspace(row.workspace as unknown as Workspace) }))
    .sort((a, b) => Number(a.workspace.is_demo) - Number(b.workspace.is_demo) || a.workspace.name.localeCompare(b.workspace.name));
}

export async function fetchSnapshot(supabase: ServerClient, workspace: Workspace): Promise<WorkspaceSnapshot> {
  const ws = workspace.id;
  const [members, projects, milestones, sprints, tasks, dependencies, budgetEntries] = await Promise.all([
    supabase.from("team_members").select("*").eq("workspace_id", ws).order("name"),
    supabase.from("projects").select("*").eq("workspace_id", ws).order("created_at"),
    supabase.from("milestones").select("*").eq("workspace_id", ws).order("due_date"),
    supabase.from("sprints").select("*").eq("workspace_id", ws).order("start_date"),
    supabase.from("tasks").select("*").eq("workspace_id", ws).order("due_date", { nullsFirst: false }),
    supabase.from("task_dependencies").select("project_id, task_id, depends_on_id").eq("workspace_id", ws),
    supabase.from("budget_entries").select("*").eq("workspace_id", ws).order("entry_date", { ascending: false }),
  ]);
  for (const r of [members, projects, milestones, sprints, tasks, dependencies, budgetEntries]) if (r.error) throw r.error;

  return {
    workspace,
    members: (members.data as TeamMember[]).map((m) => ({
      ...m,
      weekly_capacity_hours: Number(m.weekly_capacity_hours),
      hourly_cost: m.hourly_cost === null ? null : Number(m.hourly_cost),
    })),
    projects: (projects.data as Project[]).map((p) => ({ ...p, methodology: p.methodology ?? "waterfall", budget: Number(p.budget) })),
    milestones: milestones.data as Milestone[],
    sprints: (sprints.data ?? []) as Sprint[],
    tasks: (tasks.data as Task[]).map((t) => ({
      ...t,
      planned_hours: Number(t.planned_hours),
      actual_hours: Number(t.actual_hours),
      remaining_hours: t.remaining_hours === null ? null : Number(t.remaining_hours),
      story_points: t.story_points ?? null,
      sprint_id: t.sprint_id ?? null,
      baseline_start: t.baseline_start ?? null,
      baseline_due: t.baseline_due ?? null,
    })),
    dependencies: dependencies.data as TaskDependency[],
    budgetEntries: (budgetEntries.data as BudgetEntry[]).map((e) => ({ ...e, amount: Number(e.amount) })),
  };
}

export async function fetchActivity(supabase: ServerClient, projectId: string, limit = 50): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id, project_id, actor_id, entity_type, entity_id, action, summary, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as ActivityEvent[];
}

function normalizeWorkspace(w: Workspace): Workspace {
  return { ...w, default_hourly_rate: Number(w.default_hourly_rate), default_weekly_capacity: Number(w.default_weekly_capacity) };
}
