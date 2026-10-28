"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { askCopilot, explainCopilot, type AskResult, type ExplainCopilotResult } from "@/actions/copilot";
import { SUGGESTED_QUESTIONS, type CopilotAnswer, type CopilotLine, type CopilotQuery } from "@/lib/engine/copilot";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/system/native-select";
import { SourceLabel } from "@/components/system/states";
import { projectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

// AI Copilot conversation. Every answer is computed by the engine (askCopilot) and shown
// in three labelled layers — facts, forecasts, assumptions — plus rule-based
// recommendations. When live AI is available, Gemini then explains that same answer.

export type AiMode = "live" | "demo_off" | "not_configured";

interface Option {
  id: string;
  name: string;
}

interface Turn {
  id: number;
  question: string;
  result: AskResult | null;
  ai: ExplainCopilotResult | null;
  aiPending: boolean;
}

export interface CopilotProps {
  projects: Option[];
  milestones: (Option & { projectName: string })[];
  initialQuestion?: string;
  aiMode: AiMode;
}

const TONE_DOT: Record<NonNullable<CopilotLine["tone"]>, string> = { critical: "bg-critical", warning: "bg-warning", healthy: "bg-healthy", neutral: "bg-input" };

export function Copilot({ projects, milestones, initialQuestion, aiMode }: CopilotProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const update = (id: number, patch: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function ask(input: { question: string; query?: CopilotQuery }) {
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, question: input.question, result: null, ai: null, aiPending: false }]);
    setBusy(true);
    const result = await askCopilot(input.query ? { query: input.query, question: input.question } : { question: input.question });
    setBusy(false);
    update(id, { result });
    if (result.ok && result.answer && aiMode === "live") {
      update(id, { aiPending: true });
      const ai = await explainCopilot({ query: result.answer.query, question: input.question });
      update(id, { ai, aiPending: false });
    }
  }

  // A question passed in the URL (from Home or a project page) is asked once on arrival.
  useEffect(() => {
    if (!initialQuestion) return;
    const timer = setTimeout(() => void ask({ question: initialQuestion }), 0);
    return () => clearTimeout(timer);
  }, [initialQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    void ask({ question: q.trim() });
    setQ("");
  };

  return (
    <div className="grid gap-5">
      {turns.length === 0 ? (
        <Suggestions projects={projects} milestones={milestones} onAsk={ask} />
      ) : (
        <ol className="grid gap-6" aria-live="polite">
          {turns.map((t) => (
            <li key={t.id} className="grid gap-3">
              <p className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2 text-[13.5px] text-primary-foreground">{t.question}</p>
              {t.result === null ? (
                <div aria-busy="true" className="grid gap-2 rounded-lg border bg-card p-4">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
                  <p className="text-xs text-muted-foreground">Calculating from your project records…</p>
                </div>
              ) : !t.result.ok ? (
                <p role="alert" className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] text-warning">{t.result.error}</p>
              ) : t.result.answer === null ? (
                <Unrecognised onAsk={ask} projects={projects} milestones={milestones} />
              ) : (
                <AnswerCard answer={t.result.answer} ai={t.ai} aiPending={t.aiPending} aiMode={aiMode} />
              )}
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      <form onSubmit={submit} className="sticky bottom-4 flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-[0_6px_24px_-12px_rgba(28,27,25,0.25)] focus-within:border-primary/60">
        <Sparkles aria-hidden className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        <label htmlFor="copilot-q" className="sr-only">Ask the AI Copilot</label>
        <input
          id="copilot-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about deadlines, budget, workload, priorities or a what-if…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {turns.length > 0 && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Start over" onClick={() => setTurns([])}>
            <RotateCcw />
          </Button>
        )}
        <Button type="submit" size="icon-sm" disabled={!q.trim() || busy} aria-label="Ask">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}

// ── Suggested questions ─────────────────────────────────────────────────────

function Suggestions({ projects, milestones, onAsk }: { projects: Option[]; milestones: CopilotProps["milestones"]; onAsk: (i: { question: string; query?: CopilotQuery }) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [milestoneId, setMilestoneId] = useState(milestones[0]?.id ?? "");
  const [days, setDays] = useState("5");
  const project = projects.find((p) => p.id === projectId);
  const milestone = milestones.find((m) => m.id === milestoneId);
  return (
    <section aria-labelledby="suggested" className="grid gap-3">
      <h2 id="suggested" className="text-[13px] font-semibold">Try one of these</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {SUGGESTED_QUESTIONS.map((s) => {
          const needsProject = s.needs === "project";
          const needsMilestone = s.needs === "milestone";
          const disabled = (needsProject && !project) || (needsMilestone && !milestone);
          const question = needsProject && project
            ? `Can we complete ${project.name} within the remaining budget?`
            : needsMilestone && milestone
              ? `What happens if "${milestone.name}" is delayed by ${days} working days?`
              : s.label;
          return (
            <li key={s.label} className="flex flex-col gap-2 rounded-lg border bg-card p-3.5">
              <p className="text-[13.5px] leading-5 font-medium">{s.label}</p>
              {needsProject && (
                <NativeSelect aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-8 text-xs">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              )}
              {needsMilestone && (
                <div className="flex gap-2">
                  <NativeSelect aria-label="Milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="h-8 min-w-0 flex-1 text-xs">
                    {milestones.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.projectName}</option>)}
                  </NativeSelect>
                  <NativeSelect aria-label="Delay in working days" value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-24 text-xs">
                    {[1, 2, 3, 5, 10, 15].map((d) => <option key={d} value={d}>{d} days</option>)}
                  </NativeSelect>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-auto w-fit"
                disabled={disabled}
                onClick={() =>
                  onAsk({
                    question,
                    query: { ...s.query, ...(needsProject ? { projectId } : {}), ...(needsMilestone ? { milestoneId, days: Number(days) } : {}) },
                  })
                }
              >
                Ask
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Unrecognised({ onAsk, projects, milestones }: { onAsk: (i: { question: string; query?: CopilotQuery }) => void; projects: Option[]; milestones: CopilotProps["milestones"] }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4">
      <p className="text-[13px]">
        I can only answer from your project records, and I didn&apos;t recognise that question. I can help with deadline risk, budget, priorities, workload, cost reduction, milestone delays and weekly summaries.
      </p>
      <Suggestions projects={projects} milestones={milestones} onAsk={onAsk} />
    </div>
  );
}

// ── Answer ──────────────────────────────────────────────────────────────────

function Lines({ lines }: { lines: CopilotLine[] }) {
  return (
    <ul className="grid gap-1.5">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-5">
          <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", TONE_DOT[l.tone ?? "neutral"])} />
          {l.projectId ? (
            <Link href={projectHref(l.projectId)} className="hover:underline underline-offset-2">{l.text}</Link>
          ) : (
            <span>{l.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function answerText(a: CopilotAnswer) {
  const block = (title: string, lines: string[]) => (lines.length ? `\n${title}\n${lines.map((l) => `• ${l}`).join("\n")}\n` : "");
  return [
    `${a.title} — as of ${a.referenceDate}`,
    a.headline,
    block("Confirmed facts", a.facts.map((l) => l.text)),
    block("Forecasts (calculated)", a.forecasts.map((l) => l.text)),
    block("Recommendations (rule-based)", a.recommendations.map((l) => l.text)),
    block("Assumptions", a.assumptions),
  ].join("\n");
}

function AnswerCard({ answer, ai, aiPending, aiMode }: { answer: CopilotAnswer; ai: ExplainCopilotResult | null; aiPending: boolean; aiMode: AiMode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerText(answer));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <SourceLabel>{answer.title}</SourceLabel>
          <p className="mt-1 text-[14.5px] leading-6 font-medium">{answer.headline}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy answer as text">
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </header>

      <AiSection ai={ai} pending={aiPending} mode={aiMode} />

      <div className="grid gap-px bg-border md:grid-cols-2">
        {answer.facts.length > 0 && (
          <section className="bg-card px-4 py-3">
            <SourceLabel>Confirmed facts · from records</SourceLabel>
            <div className="mt-2"><Lines lines={answer.facts} /></div>
          </section>
        )}
        {answer.forecasts.length > 0 && (
          <section className="bg-card px-4 py-3">
            <SourceLabel>Forecasts · calculated by the engine</SourceLabel>
            <div className="mt-2"><Lines lines={answer.forecasts} /></div>
          </section>
        )}
      </div>

      {answer.recommendations.length > 0 && (
        <section className="border-t bg-subtle px-4 py-3">
          <SourceLabel>Recommended actions · rule-based</SourceLabel>
          <div className="mt-2"><Lines lines={answer.recommendations} /></div>
        </section>
      )}

      {answer.assumptions.length > 0 && (
        <details className="group border-t">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Assumptions ({answer.assumptions.length})</span>
            <span className="hidden group-open:inline">Hide assumptions</span>
          </summary>
          <ul className="grid list-disc gap-1 px-4 pb-3 pl-8 text-xs leading-5 text-muted-foreground">
            {answer.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </details>
      )}
      {answer.query.intent === "delay" && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          To test a fix, open the <Link href={`/simulator?project=${answer.query.projectId ?? ""}`} className="font-medium text-primary hover:underline">What-if planner</Link> — reassign work, move a date or defer scope on a copy of the plan.
        </p>
      )}
    </article>
  );
}

function AiSection({ ai, pending, mode }: { ai: ExplainCopilotResult | null; pending: boolean; mode: AiMode }) {
  if (mode !== "live") {
    return (
      <p className="border-b bg-info-soft/60 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-primary">AI explanation off. </span>
        {mode === "demo_off"
          ? "Live AI is disabled in this public demo; the answer below is calculated by the ProjectPilot engine from the demo records."
          : "Add GEMINI_API_KEY and GEMINI_MODEL to the server to get a plain-language explanation. Every figure below works without it."}
      </p>
    );
  }
  if (pending) {
    return (
      <div aria-busy="true" className="grid gap-2 border-b px-4 py-3">
        <SourceLabel>AI draft · Gemini is explaining the figures</SourceLabel>
        <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
      </div>
    );
  }
  if (!ai) return null;
  if (!ai.ok) {
    return <p role="alert" className="border-b bg-warning-soft px-4 py-2.5 text-xs text-warning">AI explanation unavailable: {ai.error.message}</p>;
  }
  const e = ai.explanation;
  return (
    <section className="grid gap-3 border-b px-4 py-3">
      <SourceLabel>AI draft · explanation of the calculated answer</SourceLabel>
      <p className="text-[13.5px] leading-6">{e.answer}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {([["Risks", e.risks], ["Trade-offs", e.tradeOffs], ["Next steps", e.nextSteps]] as const).map(([label, items]) =>
          items.length ? (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <ul className="mt-1 grid list-disc gap-1 pl-4 text-[12.5px] leading-5">{items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ) : null,
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {ai.model}{ai.cached ? " · stored answer, no new model call" : ""} · {formatDateTime(ai.generatedAt)} · Every number was checked against the calculation; the model cannot change records.
      </p>
    </section>
  );
}
