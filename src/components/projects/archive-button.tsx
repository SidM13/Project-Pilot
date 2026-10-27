"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { setProjectArchived } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useActionForm } from "@/components/system/use-action-form";

export function ArchiveButton({ projectId, archived }: { projectId: string; archived: boolean }) {
  const { pending, submit } = useActionForm();
  if (archived) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => submit(() => setProjectArchived(projectId, false), { success: "Project restored" })}>
        <ArchiveRestore /> Restore
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}><Archive /> Archive</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this project?</AlertDialogTitle>
          <AlertDialogDescription>It leaves the Command Center and team-load calculations. All records are kept and you can restore it at any time.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => submit(() => setProjectArchived(projectId, true), { success: "Project archived" })}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
