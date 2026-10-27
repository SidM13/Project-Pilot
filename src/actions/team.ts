"use server";

import { refresh } from "next/cache";
import { teamMemberSchema, type TeamMemberInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

export async function createTeamMember(input: TeamMemberInput): Promise<ActionResult> {
  try {
    const data = teamMemberSchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("team_members")
      .insert({ ...data, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: null, entityType: "team_member", entityId: row.id, action: "created", summary: `Team member added: ${data.name} (${data.weekly_capacity_hours} h/week)` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTeamMember(memberId: string, input: TeamMemberInput): Promise<ActionResult> {
  try {
    const id = uuid.parse(memberId);
    const data = teamMemberSchema.parse(input);
    const ctx = await actionContext();
    const { error } = await ctx.supabase.from("team_members").update(data).eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: null, entityType: "team_member", entityId: id, action: "updated", summary: `Team member updated: ${data.name}${data.active ? "" : " (inactive)"}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
