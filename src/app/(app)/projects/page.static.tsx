"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjects, ProjectsView } from "./screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjects(sp)} render={(d) => <ProjectsView {...d} />} />;
}
