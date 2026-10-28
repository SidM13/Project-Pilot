import { z } from "zod";
import { analyzeWorkspace } from "@/lib/engine";
import { recordRiskSnapshots } from "@/lib/data/risk-history";
import { getActiveMembership, loadWorkspaceSnapshot, requireUser } from "@/lib/data/workspace";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";

// Helpers shared by server actions (not itself a "use server" module, so
// nothing here is callable from the browser).

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const uuid = z.uuid();

interface PgError {
  code?: string;
  message?: string;
}

/** Converts validation and Postgres errors into short messages safe to show users. */
export function fail(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input", fieldErrors: fieldErrors(error) };
  }
  const e = (error ?? {}) as PgError;
  if (e.message?.startsWith("dependency_cycle")) return { ok: false, error: "That dependency would create a circular chain." };
  switch (e.code) {
    case "23505":
      return { ok: false, error: "That record already exists." };
    case "23503":
      return { ok: false, error: "A referenced record no longer exists in this workspace." };
    case "23514":
      return { ok: false, error: "The values break a data rule (check dates and amounts)." };
    case "42501":
    case "PGRST301":
      return { ok: false, error: "You don't have access to that workspace." };
    case "PGRST116":
      return { ok: false, error: "Record not found." };
  }
  console.error("[action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export interface ActionContext {
  supabase: ServerClient;
  workspaceId: string;
  userId: string;
}

export async function actionContext(): Promise<ActionContext> {
  const user = await requireUser();
  const { workspace } = await getActiveMembership();
  return { supabase: await createClient(), workspaceId: workspace.id, userId: user.id };
}

export async function logActivity(
  ctx: ActionContext,
  event: { projectId: string | null; entityType: string; entityId: string | null; action: string; summary: string },
) {
  const { error } = await ctx.supabase.from("activity_events").insert({
    workspace_id: ctx.workspaceId,
    project_id: event.projectId,
    actor_id: ctx.userId,
    entity_type: event.entityType,
    entity_id: event.entityId,
    action: event.action,
    summary: event.summary.slice(0, 300),
  });
  // The change itself succeeded; a missing audit row is logged, not surfaced.
  if (error) console.error("[activity]", error);
  // Every logged change may alter calculated risk; record it if it did.
  // Uncached: the cached snapshot may predate this request's writes.
  const { workspace } = await getActiveMembership();
  await recordRiskSnapshots(ctx.workspaceId, analyzeWorkspace(await loadWorkspaceSnapshot(workspace)));
}
