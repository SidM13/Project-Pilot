"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBrief, updateBrief } from "@/actions/ai";
import { briefToMarkdown, type BriefFacts } from "@/lib/briefs/facts";
import type { BriefNarrative } from "@/lib/ai/prompts";
import type { BriefAiMeta } from "@/lib/data/briefs";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SourceLabel } from "@/components/system/states";
import { useActionForm } from "@/components/system/use-action-form";
import { cn } from "@/lib/utils";

const late = (n: number | null) => (n == null ? "unknown" : n > 0 ? `${n} wd late` : "on time");

function Section({ title, source, children }: { title: string; source: "calculated" | "ai" | "edited" | "manual"; children: React.ReactNode }) {
  const label = { calculated: "Calculated from records", ai: "AI draft", edited: "AI draft · edited", manual: "Written by the team" }[source];
  return (
    <section className="break-inside-avoid border-t pt-5">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-[17px] font-semibold tracking-tight">{title}</h2>
        <span className={cn("shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase", source === "calculated" ? "text-muted-foreground" : "text-primary")}>{label}</span>
      </div>
      {children}
    </section>
  );
}

export function BriefDocument({ id, title, facts, narrative, aiMeta, createdAt }: { id: string; title: string; facts: BriefFacts; narrative: BriefNarrative; aiMeta: BriefAiMeta; createdAt: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title, ...narrative, risksText: narrative.risks.join("\n") });
  const save = useActionForm();
  const remove = useActionForm();
  const hasAi = aiMeta.status === "drafted";
  const source = (text: string): "ai" | "edited" | "manual" => (!hasAi ? "manual" : aiMeta.edited ? "edited" : text ? "ai" : "manual");
  const aiLabel = hasAi ? (aiMeta.edited ? "AI draft, edited" : "AI draft") : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefToMarkdown(title, facts, narrative, aiLabel));
      toast.success("Brief copied as Markdown");
    } catch {
      toast.error("Clipboard access was blocked by the browser");
    }
  };

  const narrativeBlock = (key: "executiveSummary" | "recommendation" | "clientMessage", rows: number) =>
    editing ? (
      <Textarea aria-label={key} value={draft[key]} rows={rows} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="text-[14px] leading-6" />
    ) : narrative[key] ? (
      <p className="text-[14px] leading-6 whitespace-pre-line">{narrative[key]}</p>
    ) : (
      <p className="text-[13px] text-muted-foreground italic print:hidden">Not written yet — use Edit to add this section.</p>
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-muted-foreground">
          Created {formatDateTime(createdAt)}
          {hasAi && ` · narrative drafted by ${aiMeta.model}`}
          {aiMeta.editedAt && ` · edited ${formatDateTime(aiMeta.editedAt)}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setDraft({ title, ...narrative, risksText: narrative.risks.join("\n") }); setEditing(false); }}>Cancel</Button>
              <Button
                disabled={save.pending}
                onClick={() =>
                  save.submit(
                    () => updateBrief(id, { title: draft.title, narrative: { executiveSummary: draft.executiveSummary, recommendation: draft.recommendation, clientMessage: draft.clientMessage, risks: draft.risksText.split("\n").map((r) => r.trim()).filter(Boolean) } }),
                    { success: "Brief saved", onSuccess: () => setEditing(false) },
                  )
                }
              >
                {save.pending ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
              <Button variant="outline" onClick={copy}><Copy /> Copy</Button>
              <Button variant="outline" onClick={() => window.print()}><Printer /> Export PDF</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={remove.pending}><Trash2 /> Delete</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this brief?</AlertDialogTitle>
                    <AlertDialogDescription>The brief is removed. Project records and saved scenarios are not affected.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.submit(() => deleteBrief(id), { success: "Brief deleted", onSuccess: () => router.push("/reports") })}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {aiMeta.status === "unavailable" && (
        <p role="status" className="mb-6 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning print:hidden">
          AI drafting was unavailable when this brief was created ({aiMeta.reason}). The calculated sections are complete; write the narrative with Edit.
        </p>
      )}

      <article className="mx-auto max-w-[820px] rounded-lg border bg-card px-6 py-8 sm:px-10 print:max-w-none print:border-0 print:p-0">
        <header className="mb-6">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Decision brief · {facts.project.client ?? "Internal"} · as of {facts.project.referenceDate}</p>
          {editing ? (
            <Input aria-label="Title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className="mt-2 font-serif text-xl" maxLength={160} />
          ) : (
            <h1 className="mt-2 font-serif text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
          )}
          <p className="mt-2 text-[13px] text-muted-foreground">{facts.project.name}{facts.project.owner ? ` · Owner ${facts.project.owner}` : ""} · Target {facts.project.target}</p>
        </header>

        <div className="grid gap-6">
          <Section title="Current status" source="calculated">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
              {[
                ["Health", `${facts.status.healthScore}/100 · ${facts.status.healthStatus}`],
                ["Progress", `${facts.status.progressPercent}% of planned effort`],
                ["Forecast finish", `${facts.status.forecastFinish} (${late(facts.status.workingDaysLate)})`],
                ["Schedule variance", `${facts.status.scheduleVariancePoints} pts`],
                ["Budget", facts.status.budget],
                ["Spent to date", facts.status.spent],
                ["Projected cost", facts.status.projectedCost],
                ["Budget variance", facts.status.budgetVariance],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="tabular font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Executive summary" source={source(narrative.executiveSummary)}>{narrativeBlock("executiveSummary", 5)}</Section>

          {facts.decisions.length > 0 && (
            <Section title="Decisions required" source="calculated">
              <ol className="grid gap-4">
                {facts.decisions.map((d, i) => (
                  <li key={i} className="grid gap-1 text-[13px]">
                    <p className="font-semibold">{i + 1}. {d.problem}</p>
                    {d.impact && <p>{d.impact}</p>}
                    <p><span className="text-muted-foreground">Recommended action (rule-based): </span>{d.action}</p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">{d.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {facts.blockers.length > 0 && (
            <Section title="Major blockers" source="calculated">
              <ul className="grid gap-2 text-[13px]">
                {facts.blockers.map((b) => (
                  <li key={b.title}><span className="font-medium">{b.title}</span>{b.impact && <span className="text-muted-foreground"> — {b.impact}</span>}</li>
                ))}
              </ul>
            </Section>
          )}

          {facts.scenario && (
            <Section title={`Simulated scenario: ${facts.scenario.name}`} source="calculated">
              <p className="mb-2 text-xs text-muted-foreground">{facts.scenario.status === "applied" ? "Approved and applied to the plan." : "Not applied — shown for decision."}</p>
              <ul className="mb-3 list-disc pl-5 font-mono text-xs">{facts.scenario.changes.map((c) => <li key={c}>{c}</li>)}</ul>
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="py-1 font-medium">Measure</th><th className="py-1 font-medium">Current</th><th className="py-1 font-medium">Proposed</th></tr></thead>
                <tbody className="divide-y">
                  <tr><td className="py-1.5">Forecast finish</td><td>{facts.scenario.current.forecastFinish} ({late(facts.scenario.current.workingDaysLate)})</td><td className="font-medium">{facts.scenario.proposed.forecastFinish} ({late(facts.scenario.proposed.workingDaysLate)})</td></tr>
                  <tr><td className="py-1.5">Projected cost</td><td>{facts.scenario.current.projectedCost}</td><td className="font-medium">{facts.scenario.proposed.projectedCost}</td></tr>
                  <tr><td className="py-1.5">Tasks at risk</td><td>{facts.scenario.current.tasksAtRisk}</td><td className="font-medium">{facts.scenario.proposed.tasksAtRisk}</td></tr>
                </tbody>
              </table>
              <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">{facts.scenario.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </Section>
          )}

          <Section title="Recommendation" source={source(narrative.recommendation)}>{narrativeBlock("recommendation", 4)}</Section>

          <Section title="Risks and caveats" source={source(narrative.risks.join(""))}>
            {editing ? (
              <Textarea aria-label="Risks, one per line" value={draft.risksText} rows={5} onChange={(e) => setDraft((d) => ({ ...d, risksText: e.target.value }))} className="text-[14px] leading-6" />
            ) : narrative.risks.length ? (
              <ul className="list-disc space-y-1 pl-5 text-[14px] leading-6">{narrative.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            ) : (
              <p className="text-[13px] text-muted-foreground italic print:hidden">Not written yet — use Edit to add risks, one per line.</p>
            )}
          </Section>

          {facts.milestones.length > 0 && (
            <Section title="Upcoming milestones" source="calculated">
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="py-1 font-medium">Milestone</th><th className="py-1 font-medium">Due</th><th className="py-1 font-medium">Forecast</th></tr></thead>
                <tbody className="divide-y">
                  {facts.milestones.map((m) => (
                    <tr key={m.name}><td className="py-1.5">{m.name}</td><td className="tabular">{m.due}</td><td className={cn("tabular", (m.workingDaysLate ?? 0) > 0 && "font-medium text-critical")}>{m.forecast} ({late(m.workingDaysLate)})</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="Suggested client message" source={source(narrative.clientMessage)}>{narrativeBlock("clientMessage", 4)}</Section>
        </div>

        <footer className="mt-8 border-t pt-4 text-[11px] leading-4 text-muted-foreground">
          <SourceLabel>Method</SourceLabel>
          <p className="mt-1">Calculated sections are produced by ProjectPilot&apos;s documented rules and capacity forecast from project records as of {facts.project.referenceDate}; forecasts are calculations from recorded capacity and estimates, not predictions. {hasAi ? "AI-drafted sections were generated from those figures only and checked so that every number matches the calculation." : ""}</p>
        </footer>
      </article>
    </div>
  );
}
