"use client";

import { useState, useTransition } from "react";
import { explainSimulation, type ExplainResult } from "@/actions/ai";
import type { SimulationInput } from "@/lib/validation";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/system/panel";
import { SourceLabel } from "@/components/system/states";

const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

/** AI interpretation of a computed comparison. Read-only: it cannot change the plan. */
export function AiExplanation({ input, configured }: { input: SimulationInput; configured: boolean }) {
  const [state, setState] = useState<ExplainResult | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => setState(await explainSimulation(input)));

  return (
    <Panel
      title={<SourceLabel>AI interpretation</SourceLabel>}
      description={
        STATIC_DEMO
          ? "Live AI is turned off in this public demo. For the flagship scenario (ERP: System integration testing → Jordan Ruiz) you can view a labelled example recorded from a real Gemini run."
          : "Gemini explains the calculated comparison above. It receives only those figures and cannot change project records."
      }
      actions={
        configured && (
          <Button variant="outline" size="sm" disabled={pending} onClick={run}>
            {pending ? "Explaining…" : STATIC_DEMO ? "Show AI example" : state?.ok ? "Regenerate" : "Explain trade-offs"}
          </Button>
        )
      }
    >
      {!configured ? (
        <p className="text-xs text-muted-foreground">AI explanations are not configured on this server. Add GEMINI_API_KEY and GEMINI_MODEL to the server environment. All calculations above work without it.</p>
      ) : pending ? (
        <div aria-busy="true" className="grid gap-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
        </div>
      ) : !state ? (
        <p className="text-xs text-muted-foreground">Ask for a plain-language explanation of the schedule, budget and resource trade-offs in this scenario. Identical scenarios reuse the stored explanation.</p>
      ) : !state.ok ? (
        <p role="alert" className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
          {state.error.message}
          {"retryAfterSeconds" in state.error && state.error.retryAfterSeconds ? ` (retry in about ${Math.ceil(state.error.retryAfterSeconds / 60)} min)` : ""}
        </p>
      ) : (
        <div className="grid gap-4 text-[13px] leading-6">
          {state.model.includes("pre-generated") && (
            <p className="rounded-md border border-primary/20 bg-info-soft px-3 py-2 text-xs">
              <span className="font-semibold text-primary">Pre-generated example.</span> Recorded from a live Gemini run on this exact scenario; nothing was generated now. Shown only because every figure below still matches the current calculation.
            </p>
          )}
          <p className="font-medium">{state.explanation.summary}</p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {(["schedule", "budget", "resources"] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs font-medium text-muted-foreground capitalize">{k}</dt>
                <dd>{state.explanation[k]}</dd>
              </div>
            ))}
          </dl>
          {([["Trade-offs", state.explanation.tradeOffs], ["Risks", state.explanation.risks], ["Other levers in the data", state.explanation.alternatives]] as const).map(([label, items]) =>
            items.length ? (
              <div key={label}>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">{items.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ) : null,
          )}
          <p className="border-t pt-2 text-[11px] text-muted-foreground">
            {state.model.includes("pre-generated") ? "Recorded" : "Generated"} by {state.model}{state.cached && !state.model.includes("pre-generated") ? " (stored result, no new model call)" : ""} · {formatDateTime(state.generatedAt)} · Figures checked against the calculation; numbers come from the engine, not the model.
          </p>
        </div>
      )}
    </Panel>
  );
}
