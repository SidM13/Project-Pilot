"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createSprint, deleteSprint, updateSprint } from "@/actions/planning";
import { addDays } from "@/lib/engine/dates";
import type { AgileMetrics } from "@/lib/engine/planning";
import { formatShortDate } from "@/lib/format";
import type { Sprint } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/system/field";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";
import { useActionForm } from "@/components/system/use-action-form";

/** Default length of a new sprint: two weeks, starting the day after the last sprint ends. */
const DEFAULT_SPRINT_DAYS = 14;

function SprintDialog({ projectId, sprint, next, onClose }: { projectId: string; sprint?: Sprint; next: { name: string; start: string }; onClose: () => void }) {
  const [v, setV] = useState({
    name: sprint?.name ?? next.name,
    goal: sprint?.goal ?? "",
    start_date: sprint?.start_date ?? next.start,
    end_date: sprint?.end_date ?? addDays(next.start, DEFAULT_SPRINT_DAYS - 1),
  });
  const { pending, errors, submit } = useActionForm();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sprint ? `Edit ${sprint.name}` : "New sprint"}</DialogTitle>
          <DialogDescription>A sprint is a fixed time box. Plan work into it from the Backlog view on the Tasks tab.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => (sprint ? updateSprint(sprint.id, v) : createSprint(projectId, v)), { success: sprint ? "Sprint updated" : "Sprint created", onSuccess: onClose });
          }}
        >
          <Field label="Name" htmlFor="sp-name" error={errors.name}>
            <Input id="sp-name" value={v.name} onChange={set("name")} maxLength={120} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Sprint goal" htmlFor="sp-goal" error={errors.goal} hint="Optional — one sentence the team commits to">
            <Textarea id="sp-goal" value={v.goal} onChange={set("goal")} rows={2} maxLength={500} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start" htmlFor="sp-start" error={errors.start_date}>
              <Input id="sp-start" type="date" value={v.start_date} onChange={set("start_date")} aria-invalid={!!errors.start_date} />
            </Field>
            <Field label="End" htmlFor="sp-end" error={errors.end_date}>
              <Input id="sp-end" type="date" value={v.end_date} onChange={set("end_date")} aria-invalid={!!errors.end_date} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : sprint ? "Save changes" : "Create sprint"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATE_PILL = { completed: <Pill tone="healthy">Completed</Pill>, active: <Pill tone="info">Current</Pill>, upcoming: <Pill>Upcoming</Pill> };

export function SprintManager({ projectId, agile, referenceDate }: { projectId: string; agile: AgileMetrics; referenceDate: string }) {
  const [editing, setEditing] = useState<Sprint | "new" | null>(null);
  const del = useActionForm();
  const last = agile.sprints.at(-1)?.sprint;
  const next = { name: `Sprint ${agile.sprints.length + 1}`, start: last ? addDays(last.end_date, 1) : referenceDate };
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Velocity = average story points completed in finished sprints{agile.velocity !== null ? ` (${agile.velocity})` : " — known after the first sprint ends"}.
        </p>
        <Button variant="outline" onClick={() => setEditing("new")}><Plus /> New sprint</Button>
      </div>
      {agile.sprints.length === 0 ? (
        <EmptyState title="No sprints yet" description="Create your first sprint, then plan backlog items into it." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {agile.sprints.map((m) => (
            <li key={m.sprint.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  {m.sprint.name} {STATE_PILL[m.state]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(m.sprint.start_date)} – {formatShortDate(m.sprint.end_date)}
                  {m.sprint.goal ? ` · ${m.sprint.goal}` : ""}
                </p>
              </div>
              <span className="tabular text-xs text-muted-foreground">
                {m.completedPoints} / {m.committedPoints} pts done{m.unpointedTasks ? ` · ${m.unpointedTasks} unpointed` : ""}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${m.sprint.name}`} onClick={() => setEditing(m.sprint)}><Pencil /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${m.sprint.name}`}><Trash2 /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {m.sprint.name}?</AlertDialogTitle>
                    <AlertDialogDescription>Its {m.taskIds.length} task(s) move back to the product backlog. No task is deleted.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.submit(() => deleteSprint(m.sprint.id), { success: "Sprint deleted" })}>Delete sprint</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
      {editing && <SprintDialog key={editing === "new" ? "new" : editing.id} projectId={projectId} sprint={editing === "new" ? undefined : editing} next={next} onClose={() => setEditing(null)} />}
    </div>
  );
}
