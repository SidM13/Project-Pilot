import { createClient } from "@/static/supabase";
import { DEMO_USER } from "@/lib/demo/store";
import { fetchActivity, fetchMemberships, fetchSnapshot, type MembershipRole } from "@/lib/data/queries";
import type { ActivityEvent, Workspace, WorkspaceSnapshot } from "@/lib/types";

// Static (GitHub Pages) replacement for lib/data/workspace.ts: same API, same queries,
// with the active workspace kept in localStorage instead of a cookie.

export const ACTIVE_WORKSPACE_COOKIE = "pp_ws";
const ACTIVE_KEY = "projectpilot-active-workspace";

export interface Membership {
  workspace: Workspace;
  role: MembershipRole;
}

export function setActiveWorkspace(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

export async function getUser() {
  return DEMO_USER;
}
export async function requireUser() {
  return DEMO_USER;
}

export async function getMemberships(): Promise<Membership[]> {
  return fetchMemberships(await createClient(), DEMO_USER.id);
}

export async function getActiveMembership(): Promise<Membership> {
  const memberships = await getMemberships();
  let selected: string | null = null;
  try {
    selected = window.localStorage.getItem(ACTIVE_KEY);
  } catch {}
  return memberships.find((m) => m.workspace.id === selected) ?? memberships[0];
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return loadWorkspaceSnapshot((await getActiveMembership()).workspace);
}

export async function loadWorkspaceSnapshot(workspace: Workspace): Promise<WorkspaceSnapshot> {
  return fetchSnapshot(await createClient(), workspace);
}

export async function getActivity(projectId: string, limit = 50): Promise<ActivityEvent[]> {
  return fetchActivity(await createClient(), projectId, limit);
}
