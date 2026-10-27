import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { ServerClient } from "@/lib/supabase/server";
import { allowedFigures, findUngroundedFigures, outputTexts } from "./grounding";
import { AI_HOURLY_LIMIT, getAiProvider } from "./index";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts";
import type { AiError } from "./types";

export type GroundedResult<T> =
  | { ok: true; data: T; model: string; cached: boolean; generatedAt: string }
  | { ok: false; error: AiError };

interface GroundedRequest<T> {
  supabase: ServerClient;
  workspaceId: string;
  projectId: string;
  userId: string;
  kind: "simulation" | "brief";
  /** Everything the model may use. Also the cache key and the grounding whitelist. */
  context: unknown;
  prompt: (context: unknown) => string;
  schema: z.ZodType<T>;
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

/**
 * One grounded model call: cache → hourly limit → model → schema validation →
 * figure check → cache. The model receives only `context` and has no tools or
 * write access of any kind.
 */
export async function runGrounded<T>(req: GroundedRequest<T>): Promise<GroundedResult<T>> {
  const provider = getAiProvider();
  if (!provider) {
    return { ok: false, error: { kind: "not_configured", message: "AI explanations are not configured on this server (GEMINI_API_KEY and GEMINI_MODEL)." } };
  }
  const contextJson = JSON.stringify(req.context);
  const inputHash = createHash("sha256").update(`${PROMPT_VERSION}\n${req.kind}\n${provider.model}\n${contextJson}`).digest("hex");

  // 1. Identical grounded input → reuse the stored answer (no model call).
  const cached = await req.supabase
    .from("ai_explanations")
    .select("output, model, created_at")
    .eq("workspace_id", req.workspaceId)
    .eq("input_hash", inputHash)
    .maybeSingle();
  if (cached.error) console.error("[ai] cache read failed", cached.error.message);
  if (cached.data) {
    // Re-validate on every hit: cache rows are member-writable, so a stored answer is
    // trusted only if it still passes the schema and the figure check for this context.
    const parsed = req.schema.safeParse(cached.data.output);
    if (parsed.success && findUngroundedFigures(outputTexts(parsed.data), allowedFigures(req.context)).length === 0) {
      return { ok: true, data: parsed.data, model: cached.data.model, cached: true, generatedAt: cached.data.created_at };
    }
    console.warn("[ai] cached output failed re-validation; ignoring it");
  }

  // 2. Per-user hourly limit (only fresh model calls are stored, so cache hits are free).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const used = await req.supabase.from("ai_explanations").select("id", { count: "exact", head: true }).eq("created_by", req.userId).gte("created_at", since);
  if (used.error) console.error("[ai] usage count failed", used.error.message);
  if ((used.count ?? 0) >= AI_HOURLY_LIMIT) {
    return { ok: false, error: { kind: "rate_limited", message: `You have reached ${AI_HOURLY_LIMIT} AI explanations this hour. Cached explanations remain available.`, retryAfterSeconds: 3600 } };
  }

  // 3. Model call with structured output.
  const result = await provider.generateJson({
    system: SYSTEM_PROMPT,
    user: req.prompt(req.context),
    schema: req.schema,
    responseSchema: req.responseSchema,
    maxOutputTokens: req.maxOutputTokens,
  });
  if (!result.ok) return result;

  // 4. Reject any figure not present in the calculated context.
  const ungrounded = findUngroundedFigures(outputTexts(result.data), allowedFigures(req.context));
  if (ungrounded.length) {
    console.warn("[ai] ungrounded figures rejected", ungrounded);
    return {
      ok: false,
      error: { kind: "ungrounded", message: `The AI draft cited figures that are not in the calculation (${ungrounded.slice(0, 3).join(", ")}), so it was discarded. Try again or write this section manually.` },
    };
  }

  // 5. Cache (best effort — a failed write never hides a valid answer).
  const generatedAt = new Date().toISOString();
  const { error } = await req.supabase.from("ai_explanations").insert({
    workspace_id: req.workspaceId,
    project_id: req.projectId,
    kind: req.kind,
    input_hash: inputHash,
    model: result.model,
    prompt_version: PROMPT_VERSION,
    output: result.data,
    usage: result.usage,
    created_by: req.userId,
  });
  if (error && error.code !== "23505") console.error("[ai] cache write failed", error.message);

  return { ok: true, data: result.data, model: result.model, cached: false, generatedAt };
}
