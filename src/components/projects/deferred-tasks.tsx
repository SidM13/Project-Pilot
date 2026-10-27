"use client";

import { restoreTask } from "@/actions/tasks";
import { remainingHours } from "@/lib/engine/progress";
import { formatDateTime } from "@/lib/format";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/system/panel";
import { useActionForm } from "@/components/system/use-action-form";

/** Tasks deferred through a scope-reduction scenario. Excluded from all calculations until restored. */
export function DeferredTasks({ tasks }: { tasks: Task[] }) {
  const { pending, submit } = useActionForm();
  if (!tasks.length) return null;
  return (
    <Panel title={`Deferred (${tasks.length})`} description="Excluded from progress, cost, forecast and team load until restored" className="mt-6" bodyClassName="p-0">
      <ul className="divide-y">
        {tasks.map((t) => (
          <li key={t.id} id={`task-${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-muted-foreground">{t.title}</span>
              <span className="block text-xs text-muted-foreground">{remainingHours(t)} h remaining · deferred {formatDateTime(t.deferred_at)}</span>
            </span>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => submit(() => restoreTask(t.id), { success: "Task restored to the plan" })}>
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
