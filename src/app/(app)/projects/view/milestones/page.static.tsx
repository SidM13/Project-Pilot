"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectMilestones, ProjectMilestonesView } from "../../[id]/milestones/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectMilestones(sp.id ?? "")} render={(d) => <ProjectMilestonesView {...d} />} />;
}
