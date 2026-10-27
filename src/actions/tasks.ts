"use server";

import { refresh } from "next/cache";
import { wouldCreateCycle } from "@/lib/engine/graph";
import { STATUS_LABELS, type TaskStatus } from "@/lib/types";
import { dependencySchema, taskProgressSchema, taskSchema, type TaskInput, type TaskProgressInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionContext, type ActionResult } from "./shared";

// Task fields that, when changed, are worth recording in the activity history.
const TRACKED = ["status", "assignee_id", "due_date", "planned_hours", "actual_hours", "remaining_hours", "milestone_id"] as const;

async function memberName(ctx: ActionContext, id: string | null) {
  if (!id) return "Unassigned";
  const { data } = await ctx.supabase.from("team_members").select("name").eq("id", id).maybeSingle();
  return data?.name ?? "Unknown";
}

async function describeChanges(ctx: ActionContext, before: Record<string, unknown>, after: Record<string, unknown>) {
  const parts: string[] = [];
  for (const key of TRACKED) {
    if (!(key in after)) continue;
    const a = before[key] === null ? null : String(before[key]);
    const b = after[key] === null || after[key] === undefined ? null : String(after[key]);
    if (a === b || (key.endsWith("hours") && Number(a) === Number(b) && a !== null && b !== null)) continue;
    if (key === "status") parts.push(`status ${STATUS_LABELS[a as TaskStatus]} → ${STATUS_LABELS[b as TaskStatus]}`);
    else if (key === "assignee_id") parts.push(`owner ${await memberName(ctx, a)} → ${await memberName(ctx, b)}`);
    else if (key === "milestone_id") parts.push("milestone changed");
    else parts.push(`${key.replace("_", " ")} ${a ?? "—"} → ${b ?? "—"}`);
  }
  return parts;
}

export async function createTask(projectId: string, input: TaskInput): Promise<ActionResult<{ id: string }>> {
  try {
    const pid = uuid.parse(projectId);
    const data = taskSchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("tasks")
      .insert({ ...data, project_id: pid, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: pid, entityType: "task", entityId: row.id, action: "created", summary: `Task created: "${data.title}" (${data.planned_hours} h, owner ${await memberName(ctx, data.assignee_id)})` });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTask(taskId: string, input: TaskInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const data = taskSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("tasks").select("*").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("tasks").update(data).eq("id", id);
    if (error) throw error;
    const changes = await describeChanges(ctx, before, data);
    await logActivity(ctx, { projectId: before.project_id, entityType: "task", entityId: id, action: "updated", summary: `"${data.title}" updated${changes.length ? `: ${changes.join(", ")}` : ""}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Inline status / effort update from the task table. */
export async function updateTaskProgress(taskId: string, input: TaskProgressInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const data = taskProgressSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("tasks").select("*").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("tasks").update(data).eq("id", id);
    if (error) throw error;
    const changes = await describeChanges(ctx, before, data);
    if (changes.length) {
      await logActivity(ctx, { projectId: before.project_id, entityType: "task", entityId: id, action: "progress", summary: `"${before.title}": ${changes.join(", ")}` });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase.from("tasks").delete().eq("id", id).select("project_id, title").single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "task", entityId: null, action: "deleted", summary: `Task deleted: "${row.title}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Brings a deferred task back into the plan. */
export async function restoreTask(taskId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase.from("tasks").update({ deferred_at: null }).eq("id", id).select("project_id, title").single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "task", entityId: id, action: "restored", summary: `Deferred task restored to the plan: "${row.title}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Dependencies ──────────────────────────────────────────────────────────────

export async function addDependency(projectId: string, input: { task_id: string; depends_on_id: string }): Promise<ActionResult> {
  try {
    const pid = uuid.parse(projectId);
    const edge = dependencySchema.parse(input);
    const ctx = await actionContext();
    const { data: existing, error: readError } = await ctx.supabase
      .from("task_dependencies")
      .select("task_id, depends_on_id")
      .eq("project_id", pid);
    if (readError) throw readError;
    // Checked here for a clear message; the database trigger enforces it regardless.
    if (wouldCreateCycle(existing ?? [], edge.task_id, edge.depends_on_id)) {
      return { ok: false, error: "That dependency would create a circular chain." };
    }
    const { error } = await ctx.supabase
      .from("task_dependencies")
      .insert({ ...edge, project_id: pid, workspace_id: ctx.workspaceId });
    if (error) throw error;
    const { data: titles } = await ctx.supabase.from("tasks").select("id, title").in("id", [edge.task_id, edge.depends_on_id]);
    const title = (tid: string) => titles?.find((t) => t.id === tid)?.title ?? "task";
    await logActivity(ctx, { projectId: pid, entityType: "dependency", entityId: edge.task_id, action: "added", summary: `Dependency added: "${title(edge.task_id)}" now waits on "${title(edge.depends_on_id)}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeDependency(projectId: string, input: { task_id: string; depends_on_id: string }): Promise<ActionResult> {
  try {
    const pid = uuid.parse(projectId);
    const edge = dependencySchema.parse(input);
    const ctx = await actionContext();
    const { error } = await ctx.supabase
      .from("task_dependencies")
      .delete()
      .eq("task_id", edge.task_id)
      .eq("depends_on_id", edge.depends_on_id);
    if (error) throw error;
    const { data: titles } = await ctx.supabase.from("tasks").select("id, title").in("id", [edge.task_id, edge.depends_on_id]);
    const title = (tid: string) => titles?.find((t) => t.id === tid)?.title ?? "task";
    await logActivity(ctx, { projectId: pid, entityType: "dependency", entityId: edge.task_id, action: "removed", summary: `Dependency removed: "${title(edge.task_id)}" no longer waits on "${title(edge.depends_on_id)}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
