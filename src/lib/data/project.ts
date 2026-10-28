import { cache } from "react";
import { notFound } from "next/navigation";
import { analyzeProject, getReferenceDate } from "@/lib/engine";
import { getAnalysis } from "./analysis";

/** Everything a project page needs. 404s for ids outside the active workspace. */
export const getProjectView = cache(async (projectId: string) => {
  const { snapshot, analysis } = await getAnalysis();
  const project = analyzeProject(snapshot, projectId);
  if (!project) notFound();
  return {
    snapshot,
    workspaceAnalysis: analysis,
    referenceDate: getReferenceDate(snapshot.workspace),
    ...project,
    memberById: new Map(snapshot.members.map((m) => [m.id, m])),
  };
});
