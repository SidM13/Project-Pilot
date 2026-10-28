"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { createProject, updateProject } from "@/actions/projects";
import { addDays, todayISO } from "@/lib/engine/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { useActionForm } from "@/components/system/use-action-form";
import { METHODOLOGIES, METHODOLOGY_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUSES, type Methodology, type Project, type TeamMember } from "@/lib/types";
import type { ProjectInput } from "@/lib/validation";
import { projectHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Values = { [K in keyof ProjectInput]-?: string };

/** New projects default to a 12-week plan starting today. */
const DEFAULT_WEEKS = 12;

const METHOD_COPY: Record<Methodology, { summary: string; points: string[] }> = {
  waterfall: {
    summary: "Plan the whole project up front in phases, each ending at a milestone.",
    points: ["Phases, milestones and task dependencies", "Gantt chart with baseline and critical path", "Best when scope and order of work are known"],
  },
  agile: {
    summary: "Deliver in short sprints from a prioritised backlog.",
    points: ["Backlog, sprints and story points", "Sprint board and team velocity", "Best when scope will evolve with feedback"],
  },
};

function initial(project?: Project, methodology: Methodology = "waterfall"): Values {
  const start = project?.start_date ?? todayISO();
  return {
    name: project?.name ?? "",
    client_name: project?.client_name ?? "",
    description: project?.description ?? "",
    owner_member_id: project?.owner_member_id ?? "",
    status: project?.status ?? "active",
    methodology: project?.methodology ?? methodology,
    start_date: start,
    target_date: project?.target_date ?? addDays(start, DEFAULT_WEEKS * 7 - 3),
    budget: project ? String(project.budget) : "",
  };
}

function MethodologyChoice({ value, onChange }: { value: string; onChange: (m: Methodology) => void }) {
  return (
    <div role="radiogroup" aria-label="Methodology" className="grid gap-3 sm:grid-cols-2">
      {METHODOLOGIES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn("grid gap-2 rounded-lg border p-4 text-left transition-colors", value === m ? "border-primary bg-info-soft ring-1 ring-primary" : "bg-card hover:border-input hover:bg-subtle")}
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className={cn("grid size-4 place-items-center rounded-full border", value === m ? "border-primary" : "border-input")}>
              {value === m && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="text-[14px] font-semibold">{METHODOLOGY_LABELS[m]}</span>
          </span>
          <span className="text-[13px] leading-5 text-foreground/80">{METHOD_COPY[m].summary}</span>
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {METHOD_COPY[m].points.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>
        </button>
      ))}
    </div>
  );
}

function ProjectDialog({ project, members, trigger }: { project?: Project; members: TeamMember[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"method" | "details">(project ? "details" : "method");
  const [more, setMore] = useState(false);
  const [v, setV] = useState<Values>(() => initial(project));
  const { pending, errors, setErrors, submit } = useActionForm();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { ...v, budget: v.budget.trim() === "" ? "0" : v.budget } as ProjectInput;
    if (project) {
      submit(() => updateProject(project.id, input), { success: "Project updated", onSuccess: () => setOpen(false) });
    } else {
      submit(
        async () => {
          const r = await createProject(input);
          if (r.ok && r.data) router.push(projectHref(r.data.id, "tasks"));
          return r;
        },
        { success: "Project created — add your first tasks", onSuccess: () => setOpen(false) },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setV(initial(project));
          setStep(project ? "details" : "method");
          setMore(false);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        {step === "method" ? (
          <>
            <DialogHeader>
              <DialogTitle>How will you run this project?</DialogTitle>
              <DialogDescription>You can change this later without losing any information.</DialogDescription>
            </DialogHeader>
            <MethodologyChoice value={v.methodology} onChange={(m) => setV((s) => ({ ...s, methodology: m }))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => setStep("details")}>Continue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{project ? "Edit project" : `New ${METHODOLOGY_LABELS[v.methodology as Methodology]} project`}</DialogTitle>
              <DialogDescription>Only the name is required. Dates and budget drive the schedule and cost forecasts.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project name" htmlFor="p-name" error={errors.name} className="sm:col-span-2">
                  <Input id="p-name" value={v.name} onChange={set("name")} maxLength={120} required autoFocus aria-invalid={!!errors.name} placeholder="e.g. Website relaunch" />
                </Field>
                <Field label="Start date" htmlFor="p-start" error={errors.start_date}>
                  <Input id="p-start" type="date" value={v.start_date} onChange={set("start_date")} required aria-invalid={!!errors.start_date} />
                </Field>
                <Field label="Target completion" htmlFor="p-target" error={errors.target_date} hint={project ? undefined : `Defaults to ${DEFAULT_WEEKS} weeks`}>
                  <Input id="p-target" type="date" value={v.target_date} onChange={set("target_date")} required aria-invalid={!!errors.target_date} />
                </Field>
                <Field label="Planned budget" htmlFor="p-budget" error={errors.budget} hint="Optional · total approved budget">
                  <Input id="p-budget" inputMode="decimal" value={v.budget} onChange={set("budget")} placeholder="0" aria-invalid={!!errors.budget} />
                </Field>
                <Field label="Project manager" htmlFor="p-owner" error={errors.owner_member_id} hint="Optional">
                  <NativeSelect id="p-owner" value={v.owner_member_id} onChange={set("owner_member_id")}>
                    <option value="">Not set</option>
                    {members.filter((m) => m.active || m.id === v.owner_member_id).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Description" htmlFor="p-desc" error={errors.description} hint="Optional · what the project delivers" className="sm:col-span-2">
                  <Textarea id="p-desc" value={v.description} onChange={set("description")} rows={2} maxLength={2000} />
                </Field>
              </div>

              {more || project ? (
                <div className="grid gap-4 rounded-md border bg-subtle p-3 sm:grid-cols-2">
                  <Field label="Client" htmlFor="p-client" error={errors.client_name}>
                    <Input id="p-client" value={v.client_name} onChange={set("client_name")} maxLength={120} />
                  </Field>
                  <Field label="Status" htmlFor="p-status" error={errors.status}>
                    <NativeSelect id="p-status" value={v.status} onChange={set("status")}>
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {project && (
                    <Field label="Methodology" htmlFor="p-method" hint="Switching keeps every task, date and estimate" className="sm:col-span-2">
                      <NativeSelect id="p-method" value={v.methodology} onChange={set("methodology")}>
                        {METHODOLOGIES.map((m) => (
                          <option key={m} value={m}>{METHODOLOGY_LABELS[m]}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setMore(true)} className="w-fit text-xs font-medium text-primary hover:underline">More options (client, status)</button>
              )}

              <DialogFooter className={project ? undefined : "sm:justify-between"}>
                {!project && (
                  <Button type="button" variant="ghost" onClick={() => setStep("method")}><ArrowLeft /> Back</Button>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function NewProjectButton({ members }: { members: TeamMember[] }) {
  return <ProjectDialog members={members} trigger={<Button><Plus /> New project</Button>} />;
}

export function EditProjectButton({ project, members }: { project: Project; members: TeamMember[] }) {
  return <ProjectDialog project={project} members={members} trigger={<Button variant="outline"><Pencil /> Edit</Button>} />;
}
