import type { Metadata } from "next";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = { title: "New workspace" };

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        <h1 className="font-serif text-[22px] font-semibold tracking-tight">Create a workspace</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">A workspace holds your firm&apos;s projects, team and budgets. Members of one workspace cannot see another.</p>
        <CreateWorkspaceForm />
      </div>
    </div>
  );
}
