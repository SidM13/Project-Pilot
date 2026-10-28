"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateBrief } from "@/actions/ai";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { useActionForm } from "@/components/system/use-action-form";
import { briefHref } from "@/lib/routes";

export function BriefGenerator({ projects, simulations, projectId, simulationId, aiConfigured }: {
  projects: { id: string; name: string }[];
  simulations: { id: string; name: string; status: string }[];
  projectId: string;
  simulationId: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [sim, setSim] = useState(simulationId);
  const { pending, submit } = useActionForm();
  return (
    <div className="grid gap-4">
      <Field label="Project" htmlFor="brief-project">
        <NativeSelect id="brief-project" value={projectId} onChange={(e) => router.push(`/reports?project=${e.target.value}`)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Include a simulated scenario" htmlFor="brief-sim" hint="Saved in the Decision Simulator">
        <NativeSelect id="brief-sim" value={sim} onChange={(e) => setSim(e.target.value)}>
          <option value="">None — current plan only</option>
          {simulations.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
        </NativeSelect>
      </Field>
      <Button
        disabled={pending}
        onClick={() =>
          submit(
            async () => {
              const r = await generateBrief({ projectId, simulationId: sim });
              if (r.ok && r.data) router.push(briefHref(r.data.id));
              return r;
            },
            { success: "Brief created" },
          )
        }
      >
        {pending ? (aiConfigured ? "Calculating and drafting…" : "Calculating…") : "Generate decision brief"}
      </Button>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Status, variances, blockers, decisions and milestones are calculated from project records.{" "}
        {process.env.NEXT_PUBLIC_STATIC_DEMO === "1"
          ? "Live AI drafting is turned off in this public demo. For the ERP project with the “System integration testing → Jordan Ruiz” scenario, the narrative is a labelled example recorded from a real Gemini run; otherwise it starts empty for you to write."
          : aiConfigured ? "Gemini drafts the summary, recommendation, risks and client note from those figures only; you can edit everything it writes." : "AI drafting is not configured, so the narrative sections start empty for you to write."}
      </p>
    </div>
  );
}
