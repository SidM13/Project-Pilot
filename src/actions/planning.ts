"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/types";
import { sprintSchema, type SprintInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

// Methodology-specific planning: sprints and board moves (Agile), baselines (Waterfall).

export async function createSprint(projectId: string, input: SprintInput): Promise<ActionResult<{ id: string }>> {
  try {
    const pid = uuid.parse(projectId);
    const data = sprintSchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("sprints")
      .insert({ ...data, project_id: pid, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: pid, entityType: "sprint", entityId: row.id, action: "created", summary: `Sprint created: ${data.name} (${data.start_date} → ${data.end_date})` });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSprint(sprintId: string, input: SprintInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(sprintId);
    const data = sprintSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("sprints").select("project_id").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("sprints").update(data).eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: before.project_id, entityType: "sprint", entityId: id, action: "updated", summary: `Sprint updated: ${data.name}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Deletes a sprint; its tasks return to the backlog (FK on delete set null). */
export async function deleteSprint(sprintId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(sprintId);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("sprints").select("project_id, name").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("sprints").delete().eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: before.project_id, entityType: "sprint", entityId: id, action: "deleted", summary: `Sprint deleted: ${before.name} (its tasks moved to the backlog)` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const moveSchema = z.object({
  sprintId: z.union([z.uuid(), z.null()]).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

/** Board and backlog moves: change a task's sprint and/or status in one write. */
export async function moveTask(taskId: string, input: z.input<typeof moveSchema>): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const move = moveSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("tasks").select("project_id, title, status, sprint_id").eq("id", id).single();
    if (readError) throw readError;
    const patch: Record<string, unknown> = {};
    const parts: string[] = [];
    if (move.sprintId !== undefined && move.sprintId !== before.sprint_id) {
      patch.sprint_id = move.sprintId;
      let label = "Backlog";
      if (move.sprintId) {
        const { data: sprint, error: sprintError } = await ctx.supabase.from("sprints").select("name").eq("id", move.sprintId).single();
        if (sprintError) throw sprintError;
        label = sprint.name;
      }
      parts.push(`moved to ${label}`);
    }
    if (move.status && move.status !== before.status) {
      patch.status = move.status;
      if (move.status !== "blocked") patch.blocked_until = null;
      parts.push(`status ${STATUS_LABELS[before.status as TaskStatus]} → ${STATUS_LABELS[move.status]}`);
    }
    if (!parts.length) return { ok: true };
    const { error } = await ctx.supabase.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: before.project_id, entityType: "task", entityId: id, action: "updated", summary: `"${before.title}" ${parts.join(", ")}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Captures the current start/due dates of every task in the project as its baseline. */
export async function setBaseline(projectId: string): Promise<ActionResult<{ count: number }>> {
  try {
    const pid = uuid.parse(projectId);
    const ctx = await actionContext();
    const { data: tasks, error: readError } = await ctx.supabase.from("tasks").select("id, start_date, due_date").eq("project_id", pid);
    if (readError) throw readError;
    for (const t of tasks ?? []) {
      const { error } = await ctx.supabase.from("tasks").update({ baseline_start: t.start_date, baseline_due: t.due_date }).eq("id", t.id);
      if (error) throw error;
    }
    const count = (tasks ?? []).length;
    await logActivity(ctx, { projectId: pid, entityType: "project", entityId: pid, action: "baseline_set", summary: `Schedule baseline set from current dates (${count} tasks)` });
    refresh();
    return { ok: true, data: { count } };
  } catch (e) {
    return fail(e);
  }
}

/** Quick owner change from the Team tab. */
export async function assignTask(taskId: string, memberId: string | null): Promise<ActionResult> {
  try {
    const id = uuid.parse(taskId);
    const to = memberId === null ? null : uuid.parse(memberId);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("tasks").select("project_id, title, assignee_id").eq("id", id).single();
    if (readError) throw readError;
    if (before.assignee_id === to) return { ok: true };
    let name = "Unassigned";
    if (to) {
      const { data: m, error: mError } = await ctx.supabase.from("team_members").select("name, active").eq("id", to).single();
      if (mError) throw mError;
      if (!m.active) return { ok: false, error: `${m.name} is inactive. Reactivate them on the People page first.` };
      name = m.name;
    }
    const { error } = await ctx.supabase.from("tasks").update({ assignee_id: to }).eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: before.project_id, entityType: "task", entityId: id, action: "updated", summary: `"${before.title}" assigned to ${name}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
