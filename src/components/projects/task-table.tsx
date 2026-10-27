"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { updateTaskProgress } from "@/actions/tasks";
import { remainingHours } from "@/lib/engine/progress";
import { formatShortDate } from "@/lib/format";
import { STATUS_LABELS, TASK_STATUSES, type Milestone, type Task, type TaskDependency, type TaskStatus, type TeamMember } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/system/states";
import { NativeSelect } from "@/components/system/native-select";
import { Pill } from "@/components/system/status";
import { cn } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";

const STATUS_TEXT: Record<TaskStatus, string> = { todo: "", in_progress: "text-primary", blocked: "text-critical font-medium", done: "text-healthy" };

function StatusSelect({ task }: { task: Task }) {
  const [pending, start] = useTransition();
  return (
    <NativeSelect
      aria-label={`Status of ${task.title}`}
      value={task.status}
      disabled={pending}
      className={cn("w-32", STATUS_TEXT[task.status])}
      onChange={(e) => {
        const status = e.target.value as TaskStatus;
        start(async () => {
          const r = await updateTaskProgress(task.id, {
            status,
            actual_hours: task.actual_hours,
            remaining_hours: task.remaining_hours ?? "",
          });
          if (!r.ok) toast.error(r.error);
          else toast.success(`Status set to ${STATUS_LABELS[status]}`);
        });
      }}
    >
      {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
    </NativeSelect>
  );
}

export function TaskTable({
  projectId,
  tasks,
  dependencies,
  members,
  milestones,
  referenceDate,
  flaggedTaskIds,
}: {
  projectId: string;
  tasks: Task[];
  dependencies: TaskDependency[];
  members: TeamMember[];
  milestones: Milestone[];
  referenceDate: string;
  flaggedTaskIds: string[];
}) {
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const milestoneName = new Map(milestones.map((m) => [m.id, m.name]));
  const titleOf = new Map(tasks.map((t) => [t.id, t.title]));
  const flagged = new Set(flaggedTaskIds);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} · {tasks.filter((t) => t.status !== "done").length} open · select a row to edit hours, owner or dependencies
        </p>
        <Button onClick={() => setEditing("new")}><Plus /> New task</Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Add tasks with planned hours, an owner and dates. These records drive every calculation." action={<Button onClick={() => setEditing("new")}><Plus /> New task</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="bg-subtle text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Milestone</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Planned</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
                <th className="px-3 py-2 font-medium">Depends on</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map((t) => {
                const upstream = dependencies.filter((d) => d.task_id === t.id).map((d) => titleOf.get(d.depends_on_id)).filter(Boolean);
                const overdue = t.status !== "done" && !!t.due_date && t.due_date < referenceDate;
                return (
                  <tr key={t.id} id={`task-${t.id}`} className="scroll-mt-24 hover:bg-subtle target:bg-info-soft">
                    <td className="max-w-[300px] px-3 py-2">
                      <button type="button" onClick={() => setEditing(t)} className="block w-full truncate text-left font-medium hover:underline underline-offset-2" title={t.title}>
                        {t.title}
                      </button>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {t.is_critical && <Pill tone="info">Critical path</Pill>}
                        {flagged.has(t.id) && <Pill tone="warning">In findings</Pill>}
                        {t.status === "blocked" && t.blocked_reason && <span className="truncate text-xs text-critical" title={t.blocked_reason}>{t.blocked_reason}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2"><StatusSelect task={t} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.assignee_id ? memberName.get(t.assignee_id) : <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{t.milestone_id ? milestoneName.get(t.milestone_id) : "—"}</td>
                    <td className="tabular px-3 py-2 whitespace-nowrap">{formatShortDate(t.start_date)}</td>
                    <td className={cn("tabular px-3 py-2 whitespace-nowrap", overdue && "font-medium text-critical")}>{formatShortDate(t.due_date)}</td>
                    <td className="tabular px-3 py-2 text-right">{t.planned_hours}</td>
                    <td className={cn("tabular px-3 py-2 text-right", t.actual_hours > t.planned_hours && "text-warning")}>{t.actual_hours}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {remainingHours(t)}
                      {t.remaining_hours === null && t.status !== "done" && <span className="text-muted-foreground" title="Derived as planned − actual"> *</span>}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={upstream.join(", ")}>{upstream.length ? upstream.join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">* Remaining hours derived as planned − actual because no estimate was recorded.</p>

      {editing && (
        <TaskDialog
          key={editing === "new" ? "new" : editing.id}
          projectId={projectId}
          task={editing === "new" ? undefined : tasks.find((t) => t.id === editing.id)}
          tasks={tasks}
          dependencies={dependencies}
          members={members}
          milestones={milestones}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}
