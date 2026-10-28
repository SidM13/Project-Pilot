"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectOverview, ProjectOverviewView } from "../[id]/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectOverview(sp.id ?? "")} render={(d) => <ProjectOverviewView {...d} />} />;
}
