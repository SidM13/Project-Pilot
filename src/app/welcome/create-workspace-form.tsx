"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createWorkspace } from "@/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/system/field";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  return (
    <form action={action} className="mt-5 grid gap-4">
      <Field label="Workspace name" htmlFor="name" error={state && !state.ok ? state.error : undefined}>
        <Input id="name" name="name" required maxLength={120} placeholder="e.g. Northwind Advisory" />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/home" className="text-[13px] text-muted-foreground hover:text-foreground">Cancel</Link>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</Button>
      </div>
    </form>
  );
}
