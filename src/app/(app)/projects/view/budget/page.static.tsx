"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectBudget, ProjectBudgetView } from "../../[id]/budget/screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadProjectBudget(sp.id ?? "")} render={(d) => <ProjectBudgetView {...d} />} />;
}
