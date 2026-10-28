"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectTasks, ProjectTasksView } from "../../[id]/tasks/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectTasks(sp.id ?? "")} render={(d) => <ProjectTasksView {...d} />} />;
}
