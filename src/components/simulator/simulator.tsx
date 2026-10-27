"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { applySimulation, deleteSimulation, saveSimulation } from "@/actions/simulations";
import { analyzeWorkspace } from "@/lib/engine";
import { remainingHours } from "@/lib/engine/progress";
import { simulate, validateScenario, type Scenario } from "@/lib/engine/simulate";
import { formatDateTime, formatShortDate } from "@/lib/format";
import type { WorkspaceSnapshot } from "@/lib/types";
import type { SavedSimulation } from "@/lib/data/simulations";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { Panel } from "@/components/system/panel";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";
import { useActionForm } from "@/components/system/use-action-form";
import { cn } from "@/lib/utils";
import { AiExplanation } from "./ai-explanation";
import { Comparison } from "./comparison";

const KINDS: { kind: Scenario["kind"]; label: string; hint: string }[] = [
  { kind: "reassign", label: "Reallocate resource", hint: "Move a task to another team member" },
  { kind: "deadline", label: "Adjust deadline", hint: "Move a milestone or the project target" },
  { kind: "scope", label: "Reduce scope", hint: "Defer unfinished tasks" },
];

export interface SimulatorProps {
  snapshot: WorkspaceSnapshot;
  projectId: string;
  projects: { id: string; name: string }[];
  saved: SavedSimulation[];
  initial?: { kind?: string; task?: string; to?: string };
  aiConfigured: boolean;
}

export function Simulator({ snapshot, projectId, projects, saved, initial, aiConfigured }: SimulatorProps) {
  const router = useRouter();
  const [kind, setKind] = useState<Scenario["kind"]>((["reassign", "deadline", "scope"] as const).find((k) => k === initial?.kind) ?? "reassign");
  const [taskId, setTaskId] = useState(initial?.task ?? "");
  const [toMemberId, setToMemberId] = useState(initial?.to ?? "");
  const [target, setTarget] = useState<string>(`project:${projectId}`);
  const [newDate, setNewDate] = useState("");
  const [deferIds, setDeferIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const save = useActionForm();
  const apply = useActionForm();
  const remove = useActionForm();

  const base = useMemo(() => analyzeWorkspace(snapshot), [snapshot]);
  const project = snapshot.projects.find((p) => p.id === projectId)!;
  const members = new Map(snapshot.members.map((m) => [m.id, m]));
  const loads = new Map(base.loads.map((l) => [l.memberId, l]));
  const openTasks = snapshot.tasks.filter((t) => t.project_id === projectId && t.status !== "done" && !t.deferred_at);
  const milestones = snapshot.milestones.filter((m) => m.project_id === projectId && !m.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const currentTask = openTasks.find((t) => t.id === taskId);
  const owner = currentTask?.assignee_id ? members.get(currentTask.assignee_id) : undefined;

  const scenario: Scenario =
    kind === "reassign"
      ? { kind, taskId, toMemberId }
      : kind === "deadline"
        ? { kind, target: target.startsWith("project:") ? "project" : "milestone", targetId: target.split(":")[1], newDate }
        : { kind, taskIds: deferIds };
  const error = validateScenario(snapshot, projectId, scenario);
  // A simulation takes a few milliseconds; the React Compiler memoizes this render.
  const scenarioKey = JSON.stringify(scenario);
  const result = error ? null : simulate(snapshot, projectId, scenario);

  const defaultName = (() => {
    if (kind === "reassign" && currentTask) return `Reassign "${currentTask.title}" to ${members.get(toMemberId)?.name ?? "…"}`;
    if (kind === "deadline" && newDate) return `Move ${target.startsWith("project:") ? "project target" : `"${milestones.find((m) => target.endsWith(m.id))?.name}"`} to ${formatShortDate(newDate)}`;
    if (kind === "scope" && deferIds.length) return `Defer ${deferIds.length} task${deferIds.length === 1 ? "" : "s"}`;
    return "Scenario";
  })();
  const payload = () => ({ projectId, name: name.trim() || defaultName, scenario });

  const reset = () => {
    setTaskId(""); setToMemberId(""); setNewDate(""); setDeferIds([]); setName(""); setLoadedId(null);
  };
  const load = (s: SavedSimulation) => {
    setKind(s.scenario.kind);
    setName(s.name);
    setLoadedId(s.status === "draft" ? s.id : null);
    if (s.scenario.kind === "reassign") { setTaskId(s.scenario.taskId); setToMemberId(s.scenario.toMemberId); }
    if (s.scenario.kind === "deadline") { setTarget(`${s.scenario.target}:${s.scenario.targetId}`); setNewDate(s.scenario.newDate); }
    if (s.scenario.kind === "scope") setDeferIds(s.scenario.taskIds);
  };

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="grid gap-6">
        <Panel title="Scenario">
          <div className="grid gap-4">
            <Field label="Project" htmlFor="sim-project">
              <NativeSelect id="sim-project" value={projectId} onChange={(e) => router.push(`/simulator?project=${e.target.value}`)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
            </Field>

            <div role="radiogroup" aria-label="Scenario type" className="grid gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.kind}
                  onClick={() => { setKind(k.kind); setLoadedId(null); }}
                  className={cn("rounded-md border px-3 py-2 text-left", kind === k.kind ? "border-primary bg-info-soft" : "bg-card hover:bg-subtle")}
                >
                  <span className="block text-[13px] font-medium">{k.label}</span>
                  <span className="block text-xs text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>

            {kind === "reassign" && (
              <>
                <Field label="Task" htmlFor="sim-task">
                  <NativeSelect id="sim-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">Choose a task…</option>
                    {openTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} — {t.assignee_id ? members.get(t.assignee_id)?.name : "Unassigned"}, {remainingHours(t)} h</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="New owner" htmlFor="sim-to" hint={owner?.discipline ? `Same discipline (${owner.discipline}) listed first` : undefined}>
                  <NativeSelect id="sim-to" value={toMemberId} onChange={(e) => setToMemberId(e.target.value)}>
                    <option value="">Choose a team member…</option>
                    {[...snapshot.members]
                      .filter((m) => m.active && m.id !== owner?.id)
                      .sort((a, b) => Number(b.discipline === owner?.discipline) - Number(a.discipline === owner?.discipline) || (loads.get(a.id)?.loadPercent ?? 0) - (loads.get(b.id)?.loadPercent ?? 0))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name} — {m.discipline || "No discipline"}, {loads.get(m.id)?.loadPercent ?? 0}% loaded</option>
                      ))}
                  </NativeSelect>
                </Field>
              </>
            )}

            {kind === "deadline" && (
              <>
                <Field label="Date to move" htmlFor="sim-target">
                  <NativeSelect id="sim-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value={`project:${projectId}`}>Project target — {formatShortDate(project.target_date)}</option>
                    {milestones.map((m) => <option key={m.id} value={`milestone:${m.id}`}>{m.name} — {formatShortDate(m.due_date)}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="New date" htmlFor="sim-date">
                  <Input id="sim-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </Field>
              </>
            )}

            {kind === "scope" && (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1 text-xs font-medium">Unfinished tasks to defer</legend>
                {openTasks.length === 0 && <p className="text-xs text-muted-foreground">No unfinished tasks.</p>}
                {openTasks.map((t) => (
                  <label key={t.id} htmlFor={`defer-${t.id}`} className="flex items-start gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-subtle">
                    <Checkbox
                      id={`defer-${t.id}`}
                      checked={deferIds.includes(t.id)}
                      onCheckedChange={(c) => setDeferIds((ids) => (c === true ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{t.title}</span>
                      <span className="block text-xs text-muted-foreground">{remainingHours(t)} h left{t.is_critical ? " · critical path" : ""}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </Panel>

        <Panel title="Saved scenarios" description="Saving records the comparison; it does not change the plan" bodyClassName="p-0">
          {saved.length === 0 ? (
            <p className="px-4 py-5 text-center text-xs text-muted-foreground">No saved scenarios for this project.</p>
          ) : (
            <ul className="divide-y">
              {saved.map((s) => (
                <li key={s.id} className="grid gap-1 px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-medium">{s.name}</span>
                    {s.status === "applied" ? <Pill tone="healthy">Applied</Pill> : <Pill>Draft</Pill>}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {s.status === "applied" ? `Applied ${formatDateTime(s.applied_at)}` : `Saved ${formatDateTime(s.created_at)}`} · forecast {formatShortDate(s.result.current.forecastFinish)} → {formatShortDate(s.result.proposed.forecastFinish)}
                  </span>
                  {s.status === "applied" && (
                    <a href={`/reports?project=${projectId}&simulation=${s.id}`} className="w-fit text-xs font-medium text-primary hover:underline">Create brief</a>
                  )}
                  {s.status === "draft" && (
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => load(s)}>Load</button>
                      <a href={`/reports?project=${projectId}&simulation=${s.id}`} className="font-medium text-primary hover:underline">Brief</a>
                      <button type="button" className="text-muted-foreground hover:text-critical" disabled={remove.pending} onClick={() => remove.submit(() => deleteSimulation(s.id), { success: "Scenario deleted", onSuccess: () => loadedId === s.id && setLoadedId(null) })}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6">
        {!result ? (
          <EmptyState title={error ?? "Configure a scenario"} description="The comparison appears as soon as the scenario is complete. Nothing is saved or changed while you explore." />
        ) : (
          <>
            <Comparison result={result} currency={snapshot.workspace.currency} />
            <AiExplanation key={scenarioKey} input={payload()} configured={aiConfigured} />
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4">
              <Field label="Scenario name" htmlFor="sim-name" className="min-w-[260px] flex-1">
                <Input id="sim-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} maxLength={120} />
              </Field>
              <div className="flex gap-2">
                <Button variant="outline" disabled={save.pending} onClick={() => save.submit(() => saveSimulation(payload()), { success: "Scenario saved — the plan is unchanged" })}>
                  {save.pending ? "Saving…" : "Save scenario"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={apply.pending}>{apply.pending ? "Applying…" : "Apply changes…"}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply this scenario to {project.name}?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="grid gap-2 text-[13px]">
                          <p>These project records will be updated. The server re-checks the scenario against current data first, and the change is recorded in the activity history.</p>
                          <ul className="list-disc pl-5 font-mono text-xs text-foreground">{result.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => apply.submit(() => applySimulation({ ...payload(), simulationId: loadedId ?? undefined }), { success: "Applied — the project plan now reflects this change", onSuccess: reset })}>
                        Approve and apply
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
