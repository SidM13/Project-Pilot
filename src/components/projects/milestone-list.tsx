"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createMilestone, deleteMilestone, setMilestoneCompleted, updateMilestone } from "@/actions/milestones";
import { formatDate } from "@/lib/format";
import type { Milestone } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/system/field";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";
import { useActionForm } from "@/components/system/use-action-form";

export interface MilestoneRow {
  milestone: Milestone;
  openTasks: number;
  remainingHours: number;
  daysUntil: number;
  atRisk: boolean;
}

function MilestoneForm({ projectId, milestone, onDone }: { projectId: string; milestone?: Milestone; onDone: () => void }) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [due, setDue] = useState(milestone?.due_date ?? "");
  const { pending, errors, submit } = useActionForm();
  return (
    <form
      className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const input = { name, due_date: due };
        submit(() => (milestone ? updateMilestone(milestone.id, input) : createMilestone(projectId, input)), {
          success: milestone ? "Milestone updated" : "Milestone added",
          onSuccess: onDone,
        });
      }}
    >
      <Field label="Milestone" htmlFor={`ms-name-${milestone?.id ?? "new"}`} error={errors.name}>
        <Input id={`ms-name-${milestone?.id ?? "new"}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Due date" htmlFor={`ms-due-${milestone?.id ?? "new"}`} error={errors.due_date}>
        <Input id={`ms-due-${milestone?.id ?? "new"}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={!!errors.due_date} />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : milestone ? "Save" : "Add"}</Button>
      </div>
    </form>
  );
}

export function MilestoneList({ projectId, rows }: { projectId: string; rows: MilestoneRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { pending, submit } = useActionForm();

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Link tasks to a milestone from the task editor. At-risk status is calculated from linked work.</p>
        {!adding && <Button onClick={() => setAdding(true)}><Plus /> New milestone</Button>}
      </div>
      {adding && (
        <div className="rounded-lg border bg-card p-4">
          <MilestoneForm projectId={projectId} onDone={() => setAdding(false)} />
        </div>
      )}
      {rows.length === 0 && !adding ? (
        <EmptyState title="No milestones" description="Milestones mark client-visible commitments. The engine checks whether linked work can be finished before each one." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map(({ milestone: m, openTasks, remainingHours, daysUntil, atRisk }) => (
            <li key={m.id} id={`milestone-${m.id}`} className="scroll-mt-24 px-4 py-3 target:bg-info-soft">
              {editingId === m.id ? (
                <MilestoneForm projectId={projectId} milestone={m} onDone={() => setEditingId(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    id={`ms-done-${m.id}`}
                    checked={!!m.completed_at}
                    disabled={pending}
                    aria-label={m.completed_at ? `Reopen ${m.name}` : `Mark ${m.name} complete`}
                    onCheckedChange={(c) => submit(() => setMilestoneCompleted(m.id, c === true), { success: c ? "Milestone completed" : "Milestone reopened" })}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={m.completed_at ? "text-[13px] text-muted-foreground line-through" : "text-[13px] font-medium"}>{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(m.due_date)} · {openTasks} open task{openTasks === 1 ? "" : "s"} · {remainingHours} h remaining
                    </p>
                  </div>
                  {m.completed_at ? (
                    <Pill tone="healthy">Complete</Pill>
                  ) : daysUntil < 0 ? (
                    <Pill tone="critical">{-daysUntil} d overdue</Pill>
                  ) : atRisk ? (
                    <Pill tone="warning">At risk</Pill>
                  ) : (
                    <span className="text-xs text-muted-foreground">in {daysUntil} d</span>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${m.name}`} onClick={() => setEditingId(m.id)}><Pencil /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${m.name}`}><Trash2 /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{m.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>Linked tasks are kept and become unlinked.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => submit(() => deleteMilestone(m.id), { success: "Milestone deleted" })}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
