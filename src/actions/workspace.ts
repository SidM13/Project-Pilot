"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ACTIVE_WORKSPACE_COOKIE, getMemberships } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";
import { workspaceNameSchema } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

async function setActive(id: string) {
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
}

export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(workspaceId);
    const memberships = await getMemberships();
    if (!memberships.some((m) => m.workspace.id === id)) return { ok: false, error: "You are not a member of that workspace." };
    await setActive(id);
  } catch (e) {
    return fail(e);
  }
  redirect("/home");
}

export async function createWorkspace(_: unknown, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const name = workspaceNameSchema.parse(formData.get("name"));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_workspace", { p_name: name });
    if (error) throw error;
    id = data as string;
    await setActive(id);
  } catch (e) {
    return fail(e);
  }
  redirect("/home");
}

/** Restores the demo workspace to its seeded state. Only works on is_demo workspaces (enforced in SQL). */
export async function resetDemoWorkspace(): Promise<ActionResult> {
  try {
    const ctx = await actionContext();
    const { error } = await ctx.supabase.rpc("seed_demo_workspace", { ws: ctx.workspaceId });
    if (error) throw error;
    await logActivity(ctx, { projectId: null, entityType: "workspace", entityId: ctx.workspaceId, action: "reset", summary: "Demo data reset to the seeded scenario" });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
