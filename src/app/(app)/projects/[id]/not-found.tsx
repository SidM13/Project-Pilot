import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6">
      <h1 className="text-[15px] font-semibold">Project not found</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">It may belong to a different workspace, or the link is out of date.</p>
      <Link href="/projects" className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline">Back to projects</Link>
    </div>
  );
}
