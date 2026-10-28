import { getActivity } from "@/lib/data/workspace";
import { getProjectView } from "@/lib/data/project";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";

export async function loadProjectActivity(id: string) {
  const { project } = await getProjectView(id);
  return { events: await getActivity(project.id, 200) };
}

export function ProjectActivityView({ events }: Awaited<ReturnType<typeof loadProjectActivity>>) {
  if (events.length === 0) return <EmptyState title="No activity yet" description="Every change made through ProjectPilot is recorded here." />;
  return (
    <ol className="divide-y rounded-lg border bg-card">
      {events.map((e) => (
        <li key={e.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_100px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
          <span className="tabular font-mono text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
          <span><Pill>{e.entity_type.replace("_", " ")}</Pill></span>
          <span className="text-[13px]">{e.summary}</span>
        </li>
      ))}
    </ol>
  );
}
