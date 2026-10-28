"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS, type NavItem } from "./nav-items";

function ActiveNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  return <NavLink item={item} active={isNavActive(item, pathname)} />;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
        active ? "bg-nav-active font-medium text-nav-foreground ring-1 ring-border" : "text-nav-muted hover:bg-nav-hover hover:text-nav-foreground",
      )}
    >
      <Icon aria-hidden className={cn("size-4", active ? "text-primary" : "text-nav-muted")} strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

/**
 * The pathname is request data, so under Cache Components the active state is
 * rendered inside <Suspense>; `static` renders the same links without it as the fallback.
 */
export function SidebarNav({ static: isStatic = false }: { static?: boolean }) {
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col px-3">
      <div className="grid gap-0.5">
        {NAV_ITEMS.map((item) => (isStatic ? <NavLink key={item.href} item={item} active={false} /> : <ActiveNavLink key={item.href} item={item} />))}
      </div>
    </nav>
  );
}
