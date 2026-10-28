import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ActiveDemoBanner, ActiveWorkspaceSwitcher, UserBlock } from "@/components/layout/shell-parts";
import { SidebarNav } from "@/components/layout/sidebar-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      switcher={
        <Suspense fallback={<div className="h-12 rounded-md bg-nav-hover" />}>
          <ActiveWorkspaceSwitcher />
        </Suspense>
      }
      nav={
        <Suspense fallback={<SidebarNav static />}>
          <SidebarNav />
        </Suspense>
      }
      user={
        <Suspense fallback={<div className="h-12 border-t" />}>
          <UserBlock />
        </Suspense>
      }
      banner={
        <Suspense fallback={null}>
          <ActiveDemoBanner />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
