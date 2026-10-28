import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Decision } from "@/lib/engine";
import { EvidenceList } from "@/components/system/evidence-list";
import { SeverityPill, severityRule } from "@/components/system/status";
import { SourceLabel } from "@/components/system/states";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/routes";

const EVIDENCE_PREVIEW = 3;

function simulatorHref(d: Decision) {
  const q = new URLSearchParams({ project: d.projectId });
  if (d.simulation) Object.entries(d.simulation).forEach(([k, v]) => q.set(k === "toMemberId" ? "to" : k === "taskId" ? "task" : k, v));
  return `/simulator?${q}`;
}

/** One ranked decision. Problem and impact first; evidence and the recommended action open on demand. */
export function DecisionCard({ decision, rank, defaultOpen = false }: { decision: Decision; rank: number; defaultOpen?: boolean }) {
  const extra = decision.evidence.length - EVIDENCE_PREVIEW;
  return (
    <article
      className={cn(
        "relative grid gap-3 px-5 py-4 before:absolute before:top-4 before:bottom-4 before:left-0 before:w-[3px] before:rounded-r-sm",
        severityRule(decision.severity),
      )}
      aria-labelledby={`${decision.id}-title`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="tabular font-mono text-muted-foreground">{String(rank).padStart(2, "0")}</span>
        <SeverityPill severity={decision.severity} />
        <Link href={projectHref(decision.projectId)} className="font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
          {decision.projectName}
        </Link>
      </div>

      <div>
        <h3 id={`${decision.id}-title`} className="text-[14px] leading-snug font-semibold">{decision.problem}</h3>
        {decision.impact && <p className="mt-1 text-[13px] text-foreground/80">{decision.impact.label}</p>}
      </div>

      <details className="group/why grid gap-3" open={defaultOpen}>
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="group-open/why:hidden">Why, and what to do</span>
          <span className="hidden group-open/why:inline">Hide details</span>
        </summary>
      <div className="mt-3 grid gap-1.5">
        <SourceLabel>Evidence</SourceLabel>
        <EvidenceList evidence={decision.evidence} projectId={decision.projectId} limit={EVIDENCE_PREVIEW} />
        {extra > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show {extra} more</span>
              <span className="hidden group-open:inline">Show less</span>
            </summary>
            <div className="mt-1">
              <EvidenceList evidence={decision.evidence.slice(EVIDENCE_PREVIEW)} projectId={decision.projectId} />
            </div>
          </details>
        )}
      </div>

      <div className="mt-3 rounded-md border bg-subtle px-3 py-2.5">
        <SourceLabel>Recommended action · rule-based</SourceLabel>
        <p className="mt-1 text-[13px] leading-5">{decision.action}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <Link href={projectHref(decision.projectId)} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2">
          Open project <ArrowRight className="size-3" />
        </Link>
        <Link href={simulatorHref(decision)} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2">
          {decision.simulation ? "Model this action in What-if" : "Explore options in What-if"} <ArrowRight className="size-3" />
        </Link>
      </div>
      </details>
    </article>
  );
}
