"use server";

import { refresh } from "next/cache";
import { formatMoney } from "@/lib/format";
import { projectSchema, type ProjectInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = projectSchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("projects")
      .insert({ ...data, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.id, entityType: "project", entityId: row.id, action: "created", summary: `${data.methodology === "agile" ? "Agile" : "Waterfall"} project created with a ${formatMoney(data.budget)} budget` });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProject(projectId: string, input: ProjectInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(projectId);
    const data = projectSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("projects").select("budget, target_date, status, methodology").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.supabase.from("projects").update(data).eq("id", id);
    if (error) throw error;

    const changes: string[] = [];
    if (Number(before.budget) !== data.budget) changes.push(`budget ${formatMoney(Number(before.budget))} → ${formatMoney(data.budget)}`);
    if (before.target_date !== data.target_date) changes.push(`target ${before.target_date} → ${data.target_date}`);
    if (before.status !== data.status) changes.push(`status ${before.status} → ${data.status}`);
    if ((before.methodology ?? "waterfall") !== data.methodology) changes.push(`methodology ${before.methodology ?? "waterfall"} → ${data.methodology}`);
    await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action: "updated", summary: `Project details updated${changes.length ? `: ${changes.join(", ")}` : ""}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  try {
    const id = uuid.parse(projectId);
    const ctx = await actionContext();
    const { error } = await ctx.supabase
      .from("projects")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action: archived ? "archived" : "restored", summary: archived ? "Project archived" : "Project restored from archive" });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
