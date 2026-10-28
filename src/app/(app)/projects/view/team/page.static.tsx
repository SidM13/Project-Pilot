"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectTeam, ProjectTeamView } from "../../[id]/team/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectTeam(sp.id ?? "")} render={(d) => <ProjectTeamView {...d} />} />;
}
