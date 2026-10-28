import { z } from "zod";

// Bump when prompts or schemas change: the version is part of the cache key.
export const PROMPT_VERSION = "s6.1";

const RULES = [
  "You are a project-delivery analyst at a professional-services firm writing for an engagement lead.",
  "Use ONLY the facts in the JSON context. Every number, date and amount you write must appear in the context exactly as given.",
  "Never calculate new figures, estimate probabilities, or predict beyond the forecast provided. If something is not in the context, say it is not known.",
  "The figures are deterministic calculations from recorded capacity, estimates and rates — describe them as calculations or forecasts, not predictions.",
  "You cannot change project records. Recommend; do not claim anything has been done.",
  "Plain, specific business English. No headings, markdown, emoji or filler. Name people and tasks from the context.",
].join("\n");

export const SYSTEM_PROMPT = RULES;

// ── Simulation explanation ────────────────────────────────────────────────────

export const simulationExplanationSchema = z.object({
  summary: z.string().min(1).max(900),
  schedule: z.string().min(1).max(900),
  budget: z.string().min(1).max(700),
  resources: z.string().min(1).max(700),
  risks: z.array(z.string().min(1).max(500)).max(4),
  tradeOffs: z.array(z.string().min(1).max(500)).max(4),
  alternatives: z.array(z.string().min(1).max(500)).max(3),
});
export type SimulationExplanation = z.infer<typeof simulationExplanationSchema>;

const str = { type: "STRING" };
const strList = (maxItems: number) => ({ type: "ARRAY", items: str, maxItems });

export const simulationExplanationJsonSchema = {
  type: "OBJECT",
  properties: { summary: str, schedule: str, budget: str, resources: str, risks: strList(4), tradeOffs: strList(4), alternatives: strList(3) },
  required: ["summary", "schedule", "budget", "resources", "risks", "tradeOffs", "alternatives"],
};

export function simulationPrompt(context: unknown) {
  return [
    "Explain this Decision Simulator result to the engagement lead.",
    "summary: 2 sentences — what the change does and whether it helps. schedule: effect on finish date and milestones. budget: effect on projected cost and variance. resources: effect on the people involved and other projects.",
    "Length limits: summary, schedule, budget and resources under 450 characters each; each list item under 250 characters.",
    "risks: up to 4 risks of making this change, grounded in the assumptions and downstream effects. tradeOffs: up to 4 explicit gains versus costs. alternatives: up to 3 other levers suggested by the data (e.g. a blocker, a constrained person, a late milestone) — describe them qualitatively, without new numbers.",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
}

// ── Decision brief narrative ──────────────────────────────────────────────────

export const briefNarrativeSchema = z.object({
  executiveSummary: z.string().min(1).max(1500),
  recommendation: z.string().min(1).max(1200),
  risks: z.array(z.string().min(1).max(500)).max(5),
  clientMessage: z.string().min(1).max(1200),
});
export type BriefNarrative = z.infer<typeof briefNarrativeSchema>;

export const briefNarrativeJsonSchema = {
  type: "OBJECT",
  properties: { executiveSummary: str, recommendation: str, risks: strList(5), clientMessage: str },
  required: ["executiveSummary", "recommendation", "risks", "clientMessage"],
};

export function briefPrompt(facts: unknown) {
  return [
    "Draft the narrative sections of an executive decision brief from these calculated facts.",
    "Length limits: executiveSummary under 700 characters; recommendation and clientMessage under 600 characters each; at most 5 risks, each under 250 characters.",
    "executiveSummary: 3–4 sentences on status, the main issue and the decision required. recommendation: the recommended course of action and why, drawing on the listed decisions and (if present) the simulated scenario. risks: up to 5 risks or caveats, including stated assumptions. clientMessage: a short, factual note the lead could send the client — no blame, no promises beyond the forecast.",
    "Facts JSON:",
    JSON.stringify(facts),
  ].join("\n");
}

// ── AI Copilot ────────────────────────────────────────────────────────────────

export const copilotExplanationSchema = z.object({
  answer: z.string().min(1).max(900),
  risks: z.array(z.string().min(1).max(400)).max(3),
  tradeOffs: z.array(z.string().min(1).max(400)).max(3),
  nextSteps: z.array(z.string().min(1).max(400)).max(3),
});
export type CopilotExplanation = z.infer<typeof copilotExplanationSchema>;

export const copilotExplanationJsonSchema = {
  type: "OBJECT",
  properties: { answer: str, risks: strList(3), tradeOffs: strList(3), nextSteps: strList(3) },
  required: ["answer", "risks", "tradeOffs", "nextSteps"],
};

export function copilotPrompt(context: unknown) {
  return [
    "A project manager asked the question below. The calculated answer is in the context: facts are recorded data, forecasts are engine calculations, assumptions are stated limits, recommendations are rule-based.",
    "answer: 2–4 sentences that answer the question directly for a first-time project manager, in plain language. Say which figures are forecasts. Under 500 characters.",
    "risks: up to 3 risks or caveats drawn from the forecasts and assumptions. tradeOffs: up to 3 explicit gains versus costs of the recommended actions. nextSteps: up to 3 concrete actions, based on the recommendations. Each item under 220 characters.",
    "If the context does not contain what the question asks, say so in the answer instead of guessing.",
    "Context JSON:",
    JSON.stringify(context),
  ].join("\n");
}
