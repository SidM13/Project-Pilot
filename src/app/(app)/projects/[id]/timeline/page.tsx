import { loadProjectTimeline, ProjectTimelineView } from "./screen";

export default async function ProjectTimelinePage({ params }: PageProps<"/projects/[id]/timeline">) {
  return <ProjectTimelineView {...await loadProjectTimeline((await params).id)} />;
}
