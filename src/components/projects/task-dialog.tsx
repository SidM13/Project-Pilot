"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { addDependency, createTask, deleteTask, removeDependency, updateTask } from "@/actions/tasks";
import { wouldCreateCycle } from "@/lib/engine/graph";
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES, type Milestone, type Task, type TaskDependency, type TeamMember } from "@/lib/types";
import type { TaskInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { useActionForm } from "@/components/system/use-action-form";

type Values = Omit<{ [K in keyof TaskInput]: string }, "is_critical"> & { is_critical: boolean };

function initial(task?: Task): Values {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    is_critical: task?.is_critical ?? false,
    assignee_id: task?.assignee_id ?? "",
    milestone_id: task?.milestone_id ?? "",
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? "",
    planned_hours: task ? String(task.planned_hours) : "8",
    actual_hours: task ? String(task.actual_hours) : "0",
    remaining_hours: task?.remaining_hours == null ? "" : String(task.remaining_hours),
    blocked_reason: task?.blocked_reason ?? "",
    blocked_until: task?.blocked_until ?? "",
  };
}

export interface TaskDialogProps {
  projectId: string;
  task?: Task;
  tasks: Task[];
  dependencies: TaskDependency[];
  members: TeamMember[];
  milestones: Milestone[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDialog({ projectId, task, tasks, dependencies, members, milestones, open, onOpenChange }: TaskDialogProps) {
  const [v, setV] = useState<Values>(() => initial(task));
  const [newDep, setNewDep] = useState("");
  const { pending, errors, submit } = useActionForm();
  const deps = useActionForm();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const upstream = useMemo(() => (task ? dependencies.filter((d) => d.task_id === task.id) : []), [task, dependencies]);
  const candidates = useMemo(
    () =>
      task
        ? tasks.filter((t) => t.id !== task.id && !upstream.some((d) => d.depends_on_id === t.id) && !wouldCreateCycle(dependencies, task.id, t.id))
        : [],
    [task, tasks, upstream, dependencies],
  );
  const excludedForCycle = task ? tasks.filter((t) => t.id !== task.id && !upstream.some((d) => d.depends_on_id === t.id)).length - candidates.length : 0;
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Task";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = v as unknown as TaskInput;
    submit(() => (task ? updateTask(task.id, input) : createTask(projectId, input)), {
      success: task ? "Task updated" : "Task created",
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Planned, actual and remaining hours drive progress, cost-to-complete and team load.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Title" htmlFor="t-title" error={errors.title} className="sm:col-span-6">
              <Input id="t-title" value={v.title} onChange={set("title")} maxLength={200} required aria-invalid={!!errors.title} />
            </Field>
            <Field label="Status" htmlFor="t-status" className="sm:col-span-2">
              <NativeSelect id="t-status" value={v.status} onChange={set("status")}>
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="t-priority" className="sm:col-span-2">
              <NativeSelect id="t-priority" value={v.priority} onChange={set("priority")}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </NativeSelect>
            </Field>
            <div className="flex items-end pb-2 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox id="t-critical" checked={v.is_critical} onCheckedChange={(c) => setV((s) => ({ ...s, is_critical: c === true }))} />
                <Label htmlFor="t-critical" className="text-xs">Critical path</Label>
              </div>
            </div>
            <Field label="Owner" htmlFor="t-owner" className="sm:col-span-3">
              <NativeSelect id="t-owner" value={v.assignee_id} onChange={set("assignee_id")}>
                <option value="">Unassigned</option>
                {members.filter((m) => m.active || m.id === v.assignee_id).map((m) => <option key={m.id} value={m.id}>{m.name}{m.role_title ? ` — ${m.role_title}` : ""}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Milestone" htmlFor="t-milestone" className="sm:col-span-3">
              <NativeSelect id="t-milestone" value={v.milestone_id} onChange={set("milestone_id")}>
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Start date" htmlFor="t-start" error={errors.start_date} className="sm:col-span-3">
              <Input id="t-start" type="date" value={v.start_date} onChange={set("start_date")} />
            </Field>
            <Field label="Due date" htmlFor="t-due" error={errors.due_date} className="sm:col-span-3">
              <Input id="t-due" type="date" value={v.due_date} onChange={set("due_date")} aria-invalid={!!errors.due_date} />
            </Field>
            <Field label="Planned hours" htmlFor="t-planned" error={errors.planned_hours} className="sm:col-span-2">
              <Input id="t-planned" inputMode="decimal" value={v.planned_hours} onChange={set("planned_hours")} aria-invalid={!!errors.planned_hours} />
            </Field>
            <Field label="Actual hours" htmlFor="t-actual" error={errors.actual_hours} className="sm:col-span-2">
              <Input id="t-actual" inputMode="decimal" value={v.actual_hours} onChange={set("actual_hours")} aria-invalid={!!errors.actual_hours} />
            </Field>
            <Field label="Remaining hours" htmlFor="t-remaining" error={errors.remaining_hours} hint="Blank = planned − actual" className="sm:col-span-2">
              <Input id="t-remaining" inputMode="decimal" value={v.remaining_hours} onChange={set("remaining_hours")} placeholder="auto" aria-invalid={!!errors.remaining_hours} />
            </Field>
            {v.status === "blocked" && (
              <>
                <Field label="What is blocking it?" htmlFor="t-blocked" error={errors.blocked_reason} className="sm:col-span-4">
                  <Input id="t-blocked" value={v.blocked_reason} onChange={set("blocked_reason")} maxLength={1000} placeholder="e.g. Waiting on vendor credentials" />
                </Field>
                <Field label="Expected to clear" htmlFor="t-blocked-until" error={errors.blocked_until} hint="Blank = forecast assumes today" className="sm:col-span-2">
                  <Input id="t-blocked-until" type="date" value={v.blocked_until} onChange={set("blocked_until")} />
                </Field>
              </>
            )}
            <Field label="Description" htmlFor="t-desc" className="sm:col-span-6">
              <Textarea id="t-desc" value={v.description} onChange={set("description")} rows={2} maxLength={4000} />
            </Field>
          </div>

          {task && (
            <fieldset className="grid gap-2 rounded-md border bg-subtle p-3">
              <legend className="px-1 text-xs font-medium">Depends on</legend>
              {upstream.length === 0 ? (
                <p className="text-xs text-muted-foreground">No dependencies. This task can start independently.</p>
              ) : (
                <ul className="grid gap-1">
                  {upstream.map((d) => (
                    <li key={d.depends_on_id} className="flex items-center justify-between gap-2 rounded-sm bg-card px-2 py-1 text-[13px] shadow-[0_0_0_1px_var(--border)]">
                      <span className="truncate">{titleOf(d.depends_on_id)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove dependency on ${titleOf(d.depends_on_id)}`}
                        disabled={deps.pending}
                        onClick={() => deps.submit(() => removeDependency(projectId, { task_id: task.id, depends_on_id: d.depends_on_id }), { success: "Dependency removed" })}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <NativeSelect aria-label="Add a dependency" value={newDep} onChange={(e) => setNewDep(e.target.value)} className="flex-1">
                  <option value="">Add a task this one waits on…</option>
                  {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </NativeSelect>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newDep || deps.pending}
                  onClick={() => deps.submit(() => addDependency(projectId, { task_id: task.id, depends_on_id: newDep }), { success: "Dependency added", onSuccess: () => setNewDep("") })}
                >
                  <Plus /> Add
                </Button>
              </div>
              {excludedForCycle > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {excludedForCycle} task{excludedForCycle === 1 ? " is" : "s are"} hidden because {excludedForCycle === 1 ? "it already depends" : "they already depend"} on this task (that would be circular).
                </p>
              )}
            </fieldset>
          )}

          <DialogFooter className="sm:justify-between">
            {task ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive"><Trash2 /> Delete</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{task.title}”?</AlertDialogTitle>
                    <AlertDialogDescription>Its dependencies are removed too. Recorded spend linked to it is kept. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => submit(() => deleteTask(task.id), { success: "Task deleted", onSuccess: () => onOpenChange(false) })}>Delete task</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : task ? "Save changes" : "Create task"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
