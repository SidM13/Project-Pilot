import "server-only";
import { cache } from "react";
import { analyzeWorkspace } from "@/lib/engine";
import { getWorkspaceSnapshot } from "./workspace";

/** The engine's view of the active workspace, computed once per request. */
export const getAnalysis = cache(async () => {
  const snapshot = await getWorkspaceSnapshot();
  return { snapshot, analysis: analyzeWorkspace(snapshot) };
});
