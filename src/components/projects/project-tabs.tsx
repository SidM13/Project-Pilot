"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "tasks", label: "Tasks" },
  { slug: "milestones", label: "Milestones" },
  { slug: "budget", label: "Budget" },
  { slug: "activity", label: "Activity" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav aria-label="Project sections" className="mb-6 flex gap-5 overflow-x-auto border-b">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={t.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-2.5 text-[13px] whitespace-nowrap", active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
