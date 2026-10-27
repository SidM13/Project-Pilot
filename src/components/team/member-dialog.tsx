"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { createTeamMember, updateTeamMember } from "@/actions/team";
import type { TeamMember } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/system/field";
import { useActionForm } from "@/components/system/use-action-form";

const initial = (m?: TeamMember) => ({
  name: m?.name ?? "",
  role_title: m?.role_title ?? "",
  discipline: m?.discipline ?? "",
  weekly_capacity_hours: m ? String(m.weekly_capacity_hours) : "40",
  hourly_cost: m?.hourly_cost == null ? "" : String(m.hourly_cost),
  active: m?.active ?? true,
});

export function MemberDialog({ member, disciplines }: { member?: TeamMember; disciplines: string[] }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(() => initial(member));
  const { pending, errors, setErrors, submit } = useActionForm();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial(member)); setErrors({}); } }}>
      <DialogTrigger asChild>
        {member ? <Button variant="ghost" size="icon-sm" aria-label={`Edit ${member.name}`}><Pencil /></Button> : <Button><Plus /> Add member</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? "Edit team member" : "Add team member"}</DialogTitle>
          <DialogDescription>Capacity and hourly cost feed team load and cost-to-complete. Team members do not need a login.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => (member ? updateTeamMember(member.id, v) : createTeamMember(v)), { success: member ? "Member updated" : "Member added", onSuccess: () => setOpen(false) });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="tm-name" error={errors.name} className="sm:col-span-2">
              <Input id="tm-name" value={v.name} onChange={set("name")} maxLength={80} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Role" htmlFor="tm-role" error={errors.role_title}>
              <Input id="tm-role" value={v.role_title} onChange={set("role_title")} maxLength={80} placeholder="e.g. Data Engineer" />
            </Field>
            <Field label="Discipline" htmlFor="tm-discipline" error={errors.discipline} hint="Reassignments are only suggested within a discipline">
              <Input id="tm-discipline" list="tm-disciplines" value={v.discipline} onChange={set("discipline")} maxLength={40} placeholder="e.g. Engineering" />
              <datalist id="tm-disciplines">{disciplines.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Capacity (h / week)" htmlFor="tm-cap" error={errors.weekly_capacity_hours}>
              <Input id="tm-cap" inputMode="decimal" value={v.weekly_capacity_hours} onChange={set("weekly_capacity_hours")} aria-invalid={!!errors.weekly_capacity_hours} />
            </Field>
            <Field label="Hourly cost" htmlFor="tm-cost" error={errors.hourly_cost} hint="Blank = workspace default rate">
              <Input id="tm-cost" inputMode="decimal" value={v.hourly_cost} onChange={set("hourly_cost")} aria-invalid={!!errors.hourly_cost} />
            </Field>
          </div>
          {member && (
            <div className="flex items-center gap-2">
              <Checkbox id="tm-active" checked={v.active} onCheckedChange={(c) => setV((s) => ({ ...s, active: c === true }))} />
              <Label htmlFor="tm-active" className="text-xs">Active (inactive members keep their history but are not offered for new work)</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : member ? "Save" : "Add member"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
