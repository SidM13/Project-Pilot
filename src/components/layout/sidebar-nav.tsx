"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

function ActiveNavLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  return <NavLink {...props} active={pathname === props.href || pathname.startsWith(`${props.href}/`)} />;
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors",
        active ? "bg-nav-active font-medium text-nav-foreground" : "text-nav-muted hover:bg-nav-hover hover:text-nav-foreground",
      )}
    >
      {label}
    </Link>
  );
}

/**
 * The pathname is request data, so under Cache Components the active state is
 * rendered inside <Suspense>; `static` renders the same links without it as the fallback.
 */
export function SidebarNav({ static: isStatic = false }: { static?: boolean }) {
  const Item = isStatic ? (p: { href: string; label: string }) => <NavLink {...p} active={false} /> : ActiveNavLink;
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-6 px-3">
      <div className="grid gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Item key={item.href} {...item} />
        ))}
      </div>
      <div className="grid gap-0.5">
        <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-nav-muted uppercase">Workspace</p>
        {SECONDARY_NAV_ITEMS.map((item) => (
          <Item key={item.href} {...item} />
        ))}
      </div>
    </nav>
  );
}
