"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectActivity, ProjectActivityView } from "../../[id]/activity/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectActivity(sp.id ?? "")} render={(d) => <ProjectActivityView {...d} />} />;
}
