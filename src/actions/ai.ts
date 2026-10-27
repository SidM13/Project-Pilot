"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getActiveMembership, loadWorkspaceSnapshot } from "@/lib/data/workspace";
import { analyzeWorkspace, getReferenceDate } from "@/lib/engine";
import { simulate, validateScenario, type Scenario, type SimulationResult } from "@/lib/engine/simulate";
import { simulationContext } from "@/lib/ai/grounding";
import { briefNarrativeJsonSchema, briefNarrativeSchema, briefPrompt, simulationExplanationJsonSchema, simulationExplanationSchema, simulationPrompt, type BriefNarrative, type SimulationExplanation } from "@/lib/ai/prompts";
import { runGrounded } from "@/lib/ai/service";
import type { AiError } from "@/lib/ai/types";
import { buildBriefFacts } from "@/lib/briefs/facts";
import { simulationInputSchema, type SimulationInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

// AI actions are read-only with respect to project data: they recompute from
// records on the server, send only calculated context to the model, and store
// only explanations and briefs. There is no code path from model output to a
// project record.

export type ExplainResult =
  | { ok: true; explanation: SimulationExplanation; model: string; cached: boolean; generatedAt: string }
  | { ok: false; error: AiError | { kind: "invalid_input"; message: string } };

export async function explainSimulation(input: SimulationInput): Promise<ExplainResult> {
  try {
    const data = simulationInputSchema.parse(input);
    const ctx = await actionContext();
    const { workspace } = await getActiveMembership();
    const snapshot = await loadWorkspaceSnapshot(workspace);
    const scenario = data.scenario as Scenario;
    const invalid = validateScenario(snapshot, data.projectId, scenario);
    if (invalid) return { ok: false, error: { kind: "invalid_input", message: invalid } };
    const result = simulate(snapshot, data.projectId, scenario, getReferenceDate(workspace));

    const r = await runGrounded({
      supabase: ctx.supabase,
      workspaceId: ctx.workspaceId,
      projectId: data.projectId,
      userId: ctx.userId,
      kind: "simulation",
      context: simulationContext(snapshot, result),
      prompt: simulationPrompt,
      schema: simulationExplanationSchema,
      responseSchema: simulationExplanationJsonSchema,
      maxOutputTokens: 1200,
    });
    return r.ok ? { ok: true, explanation: r.data, model: r.model, cached: r.cached, generatedAt: r.generatedAt } : r;
  } catch (e) {
    const f = fail(e);
    return { ok: false, error: { kind: "invalid_input", message: f.ok ? "Unexpected error" : f.error } };
  }
}

const generateBriefSchema = z.object({ projectId: z.uuid(), simulationId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null) });

/** Creates a brief: calculated facts always; AI narrative when available, otherwise empty sections to write manually. */
export async function generateBrief(input: z.input<typeof generateBriefSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { projectId, simulationId } = generateBriefSchema.parse(input);
    const ctx = await actionContext();
    const { workspace } = await getActiveMembership();
    const snapshot = await loadWorkspaceSnapshot(workspace);
    const analysis = analyzeWorkspace(snapshot);

    type SavedScenario = { name: string; status: "draft" | "applied"; result: SimulationResult };
    let simulation: SavedScenario | null = null;
    if (simulationId) {
      const { data, error } = await ctx.supabase.from("simulations").select("name, status, result").eq("id", simulationId).eq("project_id", projectId).single();
      if (error) throw error;
      simulation = data as SavedScenario;
    }
    const facts = buildBriefFacts(snapshot, projectId, simulation, analysis);

    const ai = await runGrounded({
      supabase: ctx.supabase,
      workspaceId: ctx.workspaceId,
      projectId,
      userId: ctx.userId,
      kind: "brief",
      context: facts,
      prompt: briefPrompt,
      schema: briefNarrativeSchema,
      responseSchema: briefNarrativeJsonSchema,
      maxOutputTokens: 1400,
    });
    const narrative: BriefNarrative = ai.ok ? ai.data : { executiveSummary: "", recommendation: "", risks: [], clientMessage: "" };
    const aiMeta = ai.ok ? { status: "drafted", model: ai.model, generatedAt: ai.generatedAt } : { status: "unavailable", reason: ai.error.message };

    const title = `Decision brief — ${facts.project.name} — ${facts.project.referenceDate}`;
    const { data: row, error } = await ctx.supabase
      .from("decision_briefs")
      .insert({ workspace_id: ctx.workspaceId, project_id: projectId, simulation_id: simulationId, title, facts, narrative, ai_meta: aiMeta, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId, entityType: "brief", entityId: row.id, action: "created", summary: `Decision brief created${ai.ok ? " (AI-drafted narrative)" : " (AI unavailable — narrative to be written)"}` });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

const updateBriefSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  narrative: z.object({
    executiveSummary: z.string().max(4000),
    recommendation: z.string().max(4000),
    risks: z.array(z.string().trim().min(1).max(600)).max(12),
    clientMessage: z.string().max(4000),
  }),
});

/** Saves human edits to the narrative. Calculated facts are never editable. */
export async function updateBrief(briefId: string, input: z.input<typeof updateBriefSchema>): Promise<ActionResult> {
  try {
    const id = uuid.parse(briefId);
    const data = updateBriefSchema.parse(input);
    const ctx = await actionContext();
    const { data: before, error: readError } = await ctx.supabase.from("decision_briefs").select("project_id, ai_meta").eq("id", id).single();
    if (readError) throw readError;
    const meta = { ...(before.ai_meta as Record<string, unknown>), edited: true, editedAt: new Date().toISOString() };
    const { error } = await ctx.supabase.from("decision_briefs").update({ title: data.title, narrative: data.narrative, ai_meta: meta }).eq("id", id);
    if (error) throw error;
    await logActivity(ctx, { projectId: before.project_id, entityType: "brief", entityId: id, action: "edited", summary: `Decision brief edited: "${data.title}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBrief(briefId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(briefId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase.from("decision_briefs").delete().eq("id", id).select("project_id, title").single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "brief", entityId: null, action: "deleted", summary: `Decision brief deleted: "${row.title}"` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
