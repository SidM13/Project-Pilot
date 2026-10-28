import { loadProjectBudget, ProjectBudgetView } from "./screen";

export default async function ProjectBudgetPage({ params }: PageProps<"/projects/[id]/budget">) {
  return <ProjectBudgetView {...await loadProjectBudget((await params).id)} />;
}
