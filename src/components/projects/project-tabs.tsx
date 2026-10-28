"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectHref, type ProjectTab } from "@/lib/routes";
import { cn } from "@/lib/utils";

const TABS: { tab?: ProjectTab; label: string }[] = [
  { label: "Overview" },
  { tab: "tasks", label: "Tasks" },
  { tab: "timeline", label: "Timeline" },
  { tab: "budget", label: "Budget" },
  { tab: "team", label: "Team" },
];

const pathOf = (href: string) => href.split(/[?#]/)[0].replace(/\/$/, "");

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = pathOf(usePathname());
  return (
    <nav aria-label="Project sections" className="mb-6 flex gap-5 overflow-x-auto border-b">
      {TABS.map((t) => {
        const href = projectHref(projectId, t.tab);
        const active = pathname === pathOf(href);
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-2.5 text-[13.5px] whitespace-nowrap", active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
