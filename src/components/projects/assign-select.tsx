"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { assignTask } from "@/actions/planning";
import type { TeamMember } from "@/lib/types";
import { NativeSelect } from "@/components/system/native-select";

/** Owner picker that saves on change. */
export function AssignSelect({ taskId, taskTitle, value, members }: { taskId: string; taskTitle: string; value: string | null; members: TeamMember[] }) {
  const [pending, start] = useTransition();
  return (
    <NativeSelect
      aria-label={`Owner of ${taskTitle}`}
      value={value ?? ""}
      disabled={pending}
      className="h-7 w-44 text-xs"
      onChange={(e) => {
        const to = e.target.value || null;
        start(async () => {
          const r = await assignTask(taskId, to);
          if (!r.ok) toast.error(r.error);
          else toast.success(to ? `Assigned to ${members.find((m) => m.id === to)?.name}` : "Owner removed");
        });
      }}
    >
      <option value="">Unassigned</option>
      {members.filter((m) => m.active || m.id === value).map((m) => (
        <option key={m.id} value={m.id}>{m.name}{m.role_title ? ` — ${m.role_title}` : ""}</option>
      ))}
    </NativeSelect>
  );
}
