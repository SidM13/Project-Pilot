"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectTimeline, ProjectTimelineView } from "../../[id]/timeline/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectTimeline(sp.id ?? "")} render={(d) => <ProjectTimelineView {...d} />} />;
}
