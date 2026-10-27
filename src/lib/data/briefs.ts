import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BriefFacts } from "@/lib/briefs/facts";
import type { BriefNarrative } from "@/lib/ai/prompts";

export interface BriefAiMeta {
  status: "drafted" | "unavailable";
  model?: string;
  generatedAt?: string;
  reason?: string;
  edited?: boolean;
  editedAt?: string;
}

export interface DecisionBrief {
  id: string;
  project_id: string;
  simulation_id: string | null;
  title: string;
  facts: BriefFacts;
  narrative: BriefNarrative;
  ai_meta: BriefAiMeta;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, project_id, simulation_id, title, facts, narrative, ai_meta, created_at, updated_at";

export async function getBriefs(workspaceId: string, limit = 50): Promise<DecisionBrief[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("decision_briefs").select(COLUMNS).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as DecisionBrief[];
}

export async function getBrief(id: string): Promise<DecisionBrief | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("decision_briefs").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as DecisionBrief | null;
}
