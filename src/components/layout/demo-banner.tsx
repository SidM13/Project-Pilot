"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { resetDemoWorkspace } from "@/actions/workspace";
import { formatWeekdayDate } from "@/lib/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function DemoBanner({ referenceDate, local }: { referenceDate: string; local: boolean }) {
  const [pending, start] = useTransition();
  const reset = () =>
    start(async () => {
      const r = await resetDemoWorkspace();
      if (r.ok) toast.success("Demo data restored");
      else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-info-soft px-6 py-2 text-xs lg:px-8">
      <p>
        <span className="font-semibold text-primary">Demo workspace</span>
        <span className="text-muted-foreground">
          {" "}· Fictional clients and team · Calculations use a pinned date of {formatWeekdayDate(referenceDate)}
          {local && " · Local demo mode: in-memory data, not a database — resets when the server restarts"}
        </span>
      </p>
      <AlertDialog>
        <AlertDialogTrigger className="font-medium text-primary hover:underline disabled:opacity-60" disabled={pending}>
          {pending ? "Resetting…" : "Reset demo data"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the demo workspace?</AlertDialogTitle>
            <AlertDialogDescription>All changes made in this demo workspace are replaced with the original scenario. Other workspaces are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>Reset demo data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
