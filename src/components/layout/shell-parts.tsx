import { signOut } from "@/actions/auth";
import { getReferenceDate } from "@/lib/engine";
import { getActiveMembership, getMemberships, getUser } from "@/lib/data/workspace";
import { DemoBanner } from "./demo-banner";
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
  return <DemoBanner referenceDate={getReferenceDate(workspace)} />;
}

export async function UserBlock() {
  const user = await getUser();
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
      <span className="truncate text-xs text-nav-muted" title={user?.email ?? ""}>
        {user?.email}
      </span>
      <form action={signOut}>
        <button type="submit" className="text-xs text-nav-muted hover:text-nav-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Sign out
        </button>
      </form>
    </div>
  );
}
