"use server";

import { z } from "zod";
import { getActiveMembership, loadWorkspaceSnapshot } from "@/lib/data/workspace";
import { getReferenceDate } from "@/lib/engine";
import { answerQuery, classifyQuestion, COPILOT_INTENTS, type CopilotAnswer, type CopilotQuery } from "@/lib/engine/copilot";
import { copilotExplanationJsonSchema, copilotExplanationSchema, copilotPrompt, type CopilotExplanation } from "@/lib/ai/prompts";
import { runGrounded } from "@/lib/ai/service";
import type { AiError } from "@/lib/ai/types";
import type { WorkspaceSnapshot } from "@/lib/types";
import { actionContext, fail } from "./shared";

// AI Copilot. The engine answers every question from the records (askCopilot); the model
// may then explain that calculated answer (explainCopilot), which is recomputed on the
// server — the client's copy is never trusted. Read-only: nothing here writes records.

const querySchema = z.object({
  intent: z.enum(COPILOT_INTENTS),
  projectId: z.uuid().optional(),
  milestoneId: z.uuid().optional(),
  days: z.number().int().min(1).max(120).optional(),
});

const askSchema = z.union([
  z.object({ question: z.string().trim().min(2, "Ask a question").max(500) }),
  z.object({ query: querySchema, question: z.string().trim().max(500).optional() }),
]);

export type AskInput = z.input<typeof askSchema>;

export type AskResult =
  | { ok: true; question: string; answer: CopilotAnswer }
  | { ok: true; question: string; answer: null; unrecognised: true }
  | { ok: false; error: string };

type Resolved = { query: CopilotQuery | null; error?: undefined } | { error: string; query?: undefined };

function resolve(snapshot: WorkspaceSnapshot, input: z.output<typeof askSchema>): Resolved {
  if (!("query" in input)) return { query: classifyQuestion(input.question, snapshot) };
  const q = input.query;
  const live = (id: string) => snapshot.projects.some((p) => p.id === id && !p.archived_at && p.status !== "completed");
  if (q.projectId && !live(q.projectId)) return { error: "That project is not active in this workspace." };
  if (q.intent === "delay" && !q.milestoneId) return { error: "Choose a milestone to model the delay." };
  if (q.milestoneId) {
    const m = snapshot.milestones.find((x) => x.id === q.milestoneId);
    if (!m || !live(m.project_id)) return { error: "That milestone is not in an active project." };
    return { query: { ...q, projectId: m.project_id } };
  }
  return { query: q };
}

async function load() {
  const { workspace } = await getActiveMembership();
  return { workspace, snapshot: await loadWorkspaceSnapshot(workspace) };
}

export async function askCopilot(input: AskInput): Promise<AskResult> {
  try {
    const data = askSchema.parse(input);
    await actionContext();
    const { workspace, snapshot } = await load();
    const resolved = resolve(snapshot, data);
    if (resolved.error !== undefined) return { ok: false, error: resolved.error };
    const question = data.question ?? "";
    if (!resolved.query) return { ok: true, question, answer: null, unrecognised: true };
    return { ok: true, question, answer: answerQuery(snapshot, resolved.query, getReferenceDate(workspace)) };
  } catch (e) {
    const f = fail(e);
    return { ok: false, error: f.ok ? "Unexpected error" : f.error };
  }
}

export type ExplainCopilotResult =
  | { ok: true; explanation: CopilotExplanation; model: string; cached: boolean; generatedAt: string }
  | { ok: false; error: AiError | { kind: "invalid_input"; message: string } };

/** The only facts the model sees: the engine's answer, as text lines. */
function copilotContext(question: string, a: CopilotAnswer) {
  return {
    question: question || a.title,
    referenceDate: a.referenceDate,
    title: a.title,
    headline: a.headline,
    facts: a.facts.map((l) => l.text),
    forecasts: a.forecasts.map((l) => l.text),
    assumptions: a.assumptions,
    recommendations: a.recommendations.map((l) => l.text),
  };
}

export async function explainCopilot(input: { query: CopilotQuery; question?: string }): Promise<ExplainCopilotResult> {
  try {
    const data = z.object({ query: querySchema, question: z.string().trim().max(500).optional() }).parse(input);
    const ctx = await actionContext();
    const { workspace, snapshot } = await load();
    const resolved = resolve(snapshot, data);
    if (resolved.error !== undefined || !resolved.query) return { ok: false, error: { kind: "invalid_input", message: resolved.error ?? "Unrecognised question." } };
    const query = resolved.query;
    const answer = answerQuery(snapshot, query, getReferenceDate(workspace));
    const r = await runGrounded({
      supabase: ctx.supabase,
      workspaceId: ctx.workspaceId,
      projectId: query.projectId ?? null,
      userId: ctx.userId,
      kind: "copilot",
      context: copilotContext(data.question ?? "", answer),
      prompt: copilotPrompt,
      schema: copilotExplanationSchema,
      responseSchema: copilotExplanationJsonSchema,
      maxOutputTokens: 900,
    });
    return r.ok ? { ok: true, explanation: r.data, model: r.model, cached: r.cached, generatedAt: r.generatedAt } : r;
  } catch (e) {
    const f = fail(e);
    return { ok: false, error: { kind: "invalid_input", message: f.ok ? "Unexpected error" : f.error } };
  }
}
