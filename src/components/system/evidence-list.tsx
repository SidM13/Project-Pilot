import Link from "next/link";
import type { Evidence } from "@/lib/engine";
import { projectHref } from "@/lib/routes";

/** Fact rows behind a finding. Rows that point at a task or milestone link to it. */
export function EvidenceList({ evidence, projectId, limit }: { evidence: Evidence[]; projectId?: string; limit?: number }) {
  const rows = limit ? evidence.slice(0, limit) : evidence;
  const hrefFor = (e: Evidence) => {
    if (!projectId || !e.ref) return null;
    if (e.ref.kind === "task") return projectHref(projectId, "tasks", `task-${e.ref.id}`);
    if (e.ref.kind === "milestone") return projectHref(projectId, "milestones", `milestone-${e.ref.id}`);
    if (e.ref.kind === "budget") return projectHref(projectId, "budget");
    if (e.ref.kind === "member") return `/team#member-${e.ref.id}`;
    return null;
  };
  return (
    <ul className="space-y-1">
      {rows.map((e, i) => {
        const href = hrefFor(e);
        return (
          <li key={i} className="flex gap-2 text-xs leading-5 text-muted-foreground">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-input" />
            {href ? (
              <Link href={href} className="hover:text-foreground hover:underline underline-offset-2">
                {e.text}
              </Link>
            ) : (
              <span>{e.text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
