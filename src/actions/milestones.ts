"use server";

import { refresh } from "next/cache";
import { milestoneSchema, type MilestoneInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

export async function createMilestone(projectId: string, input: MilestoneInput): Promise<ActionResult> {
  try {
    const pid = uuid.parse(projectId);
    const data = milestoneSchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("milestones")
      .insert({ ...data, project_id: pid, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: pid, entityType: "milestone", entityId: row.id, action: "created", summary: `Milestone created: "${data.name}" due ${data.due_date}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMilestone(milestoneId: string, input: MilestoneInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(milestoneId);
    const data = milestoneSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("milestones").select("project_id, due_date").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("milestones").update(data).eq("id", id);
    if (error) throw error;
    const moved = before.due_date !== data.due_date ? `: due ${before.due_date} → ${data.due_date}` : "";
    await logActivity(ctx, { projectId: before.project_id, entityType: "milestone", entityId: id, action: "updated", summary: `Milestone "${data.name}" updated${moved}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMilestoneCompleted(milestoneId: string, completed: boolean): Promise<ActionResult> {
  try {
    const id = uuid.parse(milestoneId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("milestones")
      .update({ completed_at: completed ? new Date().toISOString() : null })
      .eq("id", id)
      .select("project_id, name")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "milestone", entityId: id, action: completed ? "completed" : "reopened", summary: `Milestone ${completed ? "completed" : "reopened"}: "${row.name}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(milestoneId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase.from("milestones").delete().eq("id", id).select("project_id, name").single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "milestone", entityId: null, action: "deleted", summary: `Milestone deleted: "${row.name}" (linked tasks kept)` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
