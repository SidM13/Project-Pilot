import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityEvent,
  BudgetEntry,
  Milestone,
  Project,
  Task,
  TaskDependency,
  TeamMember,
  Workspace,
  WorkspaceSnapshot,
} from "@/lib/types";

// All reads use the signed-in user's RLS-scoped client, so a query can only ever
// return rows from workspaces the user belongs to. `cache` dedupes per request.

export const ACTIVE_WORKSPACE_COOKIE = "pp_ws";

export const getUser = cache(async () => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export interface Membership {
  workspace: Workspace;
  role: "owner" | "admin" | "member";
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(id, name, is_demo, reference_date, currency, default_hourly_rate, default_weekly_capacity)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.workspace)
    .map((row) => ({ role: row.role as Membership["role"], workspace: normalizeWorkspace(row.workspace as unknown as Workspace) }))
    .sort((a, b) => Number(a.workspace.is_demo) - Number(b.workspace.is_demo) || a.workspace.name.localeCompare(b.workspace.name));
});

/** The workspace selected by cookie, validated against membership; falls back to the first one. */
export const getActiveMembership = cache(async (): Promise<Membership> => {
  const memberships = await getMemberships();
  if (!memberships.length) redirect("/welcome");
  const selected = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return memberships.find((m) => m.workspace.id === selected) ?? memberships[0];
});

export const getWorkspaceSnapshot = cache(async (): Promise<WorkspaceSnapshot> => {
  const { workspace } = await getActiveMembership();
  const supabase = await createClient();
  const ws = workspace.id;
  const [members, projects, milestones, tasks, dependencies, budgetEntries] = await Promise.all([
    supabase.from("team_members").select("*").eq("workspace_id", ws).order("name"),
    supabase.from("projects").select("*").eq("workspace_id", ws).order("created_at"),
    supabase.from("milestones").select("*").eq("workspace_id", ws).order("due_date"),
    supabase.from("tasks").select("*").eq("workspace_id", ws).order("due_date", { nullsFirst: false }),
    supabase.from("task_dependencies").select("project_id, task_id, depends_on_id").eq("workspace_id", ws),
    supabase.from("budget_entries").select("*").eq("workspace_id", ws).order("entry_date", { ascending: false }),
  ]);
  for (const r of [members, projects, milestones, tasks, dependencies, budgetEntries]) if (r.error) throw r.error;

  return {
    workspace,
    members: (members.data as TeamMember[]).map((m) => ({
      ...m,
      weekly_capacity_hours: Number(m.weekly_capacity_hours),
      hourly_cost: m.hourly_cost === null ? null : Number(m.hourly_cost),
    })),
    projects: (projects.data as Project[]).map((p) => ({ ...p, budget: Number(p.budget) })),
    milestones: milestones.data as Milestone[],
    tasks: (tasks.data as Task[]).map((t) => ({
      ...t,
      planned_hours: Number(t.planned_hours),
      actual_hours: Number(t.actual_hours),
      remaining_hours: t.remaining_hours === null ? null : Number(t.remaining_hours),
    })),
    dependencies: dependencies.data as TaskDependency[],
    budgetEntries: (budgetEntries.data as BudgetEntry[]).map((e) => ({ ...e, amount: Number(e.amount) })),
  };
});

export async function getActivity(projectId: string, limit = 50): Promise<ActivityEvent[]> {
  const supabase = await createClient();
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
