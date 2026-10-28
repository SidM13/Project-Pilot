import { isDemoMode } from "@/lib/env";
import { getReferenceDate } from "@/lib/engine";
import { getActiveMembership, getMemberships, getUser } from "@/lib/data/workspace";
import { DemoBanner } from "./demo-banner";
import { UserBlockView } from "./user-block";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Dynamic pieces of the app shell. Each is rendered inside <Suspense> so the
// static frame (sidebar, navigation) can prerender.

export async function ActiveWorkspaceSwitcher() {
  const [active, all] = await Promise.all([getActiveMembership(), getMemberships()]);
  const toOption = (m: typeof active) => ({ id: m.workspace.id, name: m.workspace.name, isDemo: m.workspace.is_demo });
  return <WorkspaceSwitcher active={toOption(active)} options={all.map(toOption)} />;
}

export async function ActiveDemoBanner() {
  const { workspace } = await getActiveMembership();
  if (!workspace.is_demo) return null;
  return <DemoBanner referenceDate={getReferenceDate(workspace)} local={isDemoMode} />;
}

export async function UserBlock() {
  const user = await getUser();
  return <UserBlockView email={user?.email ?? ""} />;
}
