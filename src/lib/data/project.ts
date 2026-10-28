import { cache } from "react";
import { notFound } from "next/navigation";
import { analyzeProject, getReferenceDate } from "@/lib/engine";
import { computeAgile, criticalPath } from "@/lib/engine/planning";
import { getAnalysis } from "./analysis";

/** Everything a project page needs. 404s for ids outside the active workspace. */
export const getProjectView = cache(async (projectId: string) => {
  const { snapshot, analysis } = await getAnalysis();
  const project = analyzeProject(snapshot, projectId);
  if (!project) notFound();
  const referenceDate = getReferenceDate(snapshot.workspace);
  const sprints = snapshot.sprints.filter((s) => s.project_id === projectId).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return {
    snapshot,
    workspaceAnalysis: analysis,
    referenceDate,
    ...project,
    memberById: new Map(snapshot.members.map((m) => [m.id, m])),
    sprints,
    /** Sprint metrics and velocity; null for Waterfall projects. */
    agile: project.project.methodology === "agile" ? computeAgile(sprints, project.facts.tasks, referenceDate) : null,
    /** The open-task chain that sets the forecast finish (empty, with a reason, when it cannot be derived). */
    criticalPath: criticalPath(projectId, project.facts.tasks, project.facts.dependencies, analysis.forecast),
  };
});
