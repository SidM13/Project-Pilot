"use client";

import { Flag } from "lucide-react";
import { setBaseline } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useActionForm } from "@/components/system/use-action-form";

export function BaselineButton({ projectId, hasBaseline }: { projectId: string; hasBaseline: boolean }) {
  const { pending, submit } = useActionForm();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}><Flag /> {hasBaseline ? "Reset baseline" : "Set baseline"}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{hasBaseline ? "Replace the baseline with today's plan?" : "Save today's plan as the baseline?"}</AlertDialogTitle>
          <AlertDialogDescription>
            Every task&apos;s current start and due dates become its baseline. Later date changes are measured against it.
            {hasBaseline && " The previous baseline is overwritten."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => submit(() => setBaseline(projectId), { success: "Baseline saved" })}>{hasBaseline ? "Replace baseline" : "Save baseline"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
