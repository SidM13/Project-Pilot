import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Scenario, SimulationResult } from "@/lib/engine/simulate";

export interface SavedSimulation {
  id: string;
  project_id: string;
  name: string;
  kind: Scenario["kind"];
  scenario: Scenario;
  result: SimulationResult;
  reference_date: string;
  status: "draft" | "applied";
  applied_at: string | null;
  created_at: string;
}

export async function getSimulations(projectId: string, limit = 20): Promise<SavedSimulation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("simulations")
    .select("id, project_id, name, kind, scenario, result, reference_date, status, applied_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SavedSimulation[];
}
