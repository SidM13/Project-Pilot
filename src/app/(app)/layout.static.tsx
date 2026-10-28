"use client";

import { AppShell } from "@/components/layout/app-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserBlockView } from "@/components/layout/user-block";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { getActiveMembership, getMemberships, getUser } from "@/lib/data/workspace";
import { getReferenceDate } from "@/lib/engine";
import { useStaticData } from "@/static/use-static-data";

// Static (GitHub Pages) app layout: same shell, filled from the in-browser demo store.
export default function StaticAppLayout({ children }: { children: React.ReactNode }) {
  const { data } = useStaticData(async () => {
    const [active, all, user] = await Promise.all([getActiveMembership(), getMemberships(), getUser()]);
    return { active, all, user };
  }, "shell");
  const option = (m: { workspace: { id: string; name: string; is_demo: boolean } }) => ({ id: m.workspace.id, name: m.workspace.name, isDemo: m.workspace.is_demo });
  return (
    <AppShell
      switcher={data ? <WorkspaceSwitcher active={option(data.active)} options={data.all.map(option)} /> : <div className="h-12 rounded-md bg-nav-hover" />}
      nav={<SidebarNav />}
      user={<UserBlockView email={data?.user?.email ?? ""} signOutLabel="Exit demo" />}
      banner={data?.active.workspace.is_demo ? <DemoBanner referenceDate={getReferenceDate(data.active.workspace)} local /> : null}
    >
      {children}
    </AppShell>
  );
}
