"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { createProject, updateProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { useActionForm } from "@/components/system/use-action-form";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type Project, type TeamMember } from "@/lib/types";
import type { ProjectInput } from "@/lib/validation";

type Values = { [K in keyof ProjectInput]: string };

function initial(project?: Project): Values {
  return {
    name: project?.name ?? "",
    client_name: project?.client_name ?? "",
    description: project?.description ?? "",
    owner_member_id: project?.owner_member_id ?? "",
    status: project?.status ?? "active",
    start_date: project?.start_date ?? "",
    target_date: project?.target_date ?? "",
    budget: project ? String(project.budget) : "",
  };
}

function ProjectDialog({ project, members, trigger }: { project?: Project; members: TeamMember[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>(() => initial(project));
  const { pending, errors, setErrors, submit } = useActionForm();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = v as ProjectInput;
    if (project) {
      submit(() => updateProject(project.id, input), { success: "Project updated", onSuccess: () => setOpen(false) });
    } else {
      submit(
        async () => {
          const r = await createProject(input);
          if (r.ok && r.data) router.push(`/projects/${r.data.id}`);
          return r;
        },
        { success: "Project created", onSuccess: () => setOpen(false) },
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
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Budget and dates drive the schedule and cost calculations.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" htmlFor="p-name" error={errors.name} className="sm:col-span-2">
              <Input id="p-name" value={v.name} onChange={set("name")} maxLength={120} required aria-invalid={!!errors.name} />
            </Field>
            <Field label="Client" htmlFor="p-client" error={errors.client_name}>
              <Input id="p-client" value={v.client_name} onChange={set("client_name")} maxLength={120} />
            </Field>
            <Field label="Project owner" htmlFor="p-owner" error={errors.owner_member_id}>
              <NativeSelect id="p-owner" value={v.owner_member_id} onChange={set("owner_member_id")}>
                <option value="">Unassigned</option>
                {members.filter((m) => m.active || m.id === v.owner_member_id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Start date" htmlFor="p-start" error={errors.start_date}>
              <Input id="p-start" type="date" value={v.start_date} onChange={set("start_date")} required aria-invalid={!!errors.start_date} />
            </Field>
            <Field label="Target date" htmlFor="p-target" error={errors.target_date}>
              <Input id="p-target" type="date" value={v.target_date} onChange={set("target_date")} required aria-invalid={!!errors.target_date} />
            </Field>
            <Field label="Budget" htmlFor="p-budget" error={errors.budget} hint="Total approved budget, in workspace currency">
              <Input id="p-budget" inputMode="decimal" value={v.budget} onChange={set("budget")} placeholder="0" aria-invalid={!!errors.budget} />
            </Field>
            <Field label="Status" htmlFor="p-status" error={errors.status}>
              <NativeSelect id="p-status" value={v.status} onChange={set("status")}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Description" htmlFor="p-desc" error={errors.description} className="sm:col-span-2">
              <Textarea id="p-desc" value={v.description} onChange={set("description")} rows={3} maxLength={2000} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
          </DialogFooter>
        </form>
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
