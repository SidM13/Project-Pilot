import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActivityEvent, Workspace, WorkspaceSnapshot } from "@/lib/types";
import { fetchActivity, fetchMemberships, fetchSnapshot, type MembershipRole } from "./queries";

// All reads use the signed-in user's RLS-scoped client, so a query can only ever
// return rows from workspaces the user belongs to. `cache` dedupes per request.
// The static GitHub Pages build swaps this module for src/static/data/workspace.ts.

export const ACTIVE_WORKSPACE_COOKIE = "pp_ws";

export const getUser = cache(async () => {
  if (!isSupabaseConfigured && !isDemoMode) return null;
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
  role: MembershipRole;
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  return fetchMemberships(await createClient(), user.id);
});

/** The workspace selected by cookie, validated against membership; falls back to the first one. */
export const getActiveMembership = cache(async (): Promise<Membership> => {
  const memberships = await getMemberships();
  if (!memberships.length) redirect("/welcome");
  const selected = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return memberships.find((m) => m.workspace.id === selected) ?? memberships[0];
});

export const getWorkspaceSnapshot = cache(async (): Promise<WorkspaceSnapshot> => loadWorkspaceSnapshot((await getActiveMembership()).workspace));

/** Uncached load — use after writes in the same request (e.g. recording risk history). */
export async function loadWorkspaceSnapshot(workspace: Workspace): Promise<WorkspaceSnapshot> {
  return fetchSnapshot(await createClient(), workspace);
}

export async function getActivity(projectId: string, limit = 50): Promise<ActivityEvent[]> {
  return fetchActivity(await createClient(), projectId, limit);
}
