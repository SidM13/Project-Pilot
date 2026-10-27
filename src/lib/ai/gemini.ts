import type { AiError, AiProvider, AiResult, GenerateJsonRequest } from "./types";

// Google Gemini over its REST API (no SDK dependency). Server-only by construction:
// the key is passed in by lib/ai/index.ts, which reads it from a non-public env var.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 25_000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string; reason?: string }[] };
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Optional thinking budget for models that support it (0 disables thinking on Flash models). */
  thinkingBudget?: number;
  fetch?: typeof fetch;
}

function retryAfter(res: Response, body: GeminiResponse): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const delay = body.error?.details?.find((d) => d["@type"]?.endsWith("RetryInfo"))?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds) : undefined;
}

function httpError(res: Response, body: GeminiResponse): AiError {
  if (res.status === 429) return { kind: "rate_limited", message: "Gemini's rate limit was reached. Try again shortly.", retryAfterSeconds: retryAfter(res, body) };
  if (res.status >= 500) return { kind: "unavailable", message: "Gemini is temporarily unavailable. Calculations are unaffected; try again later." };
  // Google reports an invalid key as HTTP 400 with reason API_KEY_INVALID.
  const invalidKey = body.error?.details?.some((d) => d.reason === "API_KEY_INVALID");
  if (res.status === 401 || res.status === 403 || invalidKey) return { kind: "rejected", message: "Gemini rejected the server's API key or project permissions (check GEMINI_API_KEY)." };
  if (res.status === 404) return { kind: "rejected", message: "The configured Gemini model was not found (check GEMINI_MODEL)." };
  return { kind: "rejected", message: `Gemini rejected the request (HTTP ${res.status}).` };
}

export function createGeminiProvider(options: GeminiOptions): AiProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    name: "gemini",
    model: options.model,
    async generateJson<T>(req: GenerateJsonRequest<T>): Promise<AiResult<T>> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: req.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: req.responseSchema,
          ...(options.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } } : {}),
        },
      };

      let res: Response;
      try {
        res = await doFetch(`${ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return { ok: false, error: { kind: "unavailable", message: "Could not reach Gemini (network error or timeout). Calculations are unaffected." } };
      }

      const json = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) return { ok: false, error: httpError(res, json) };

      if (json.promptFeedback?.blockReason) {
        return { ok: false, error: { kind: "blocked", message: "Gemini declined to answer this request." } };
      }
      const candidate = json.candidates?.[0];
      if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "RECITATION") {
        return { ok: false, error: { kind: "blocked", message: "Gemini stopped the response for policy reasons." } };
      }
      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (candidate?.finishReason === "MAX_TOKENS") {
        return { ok: false, error: { kind: "invalid_output", message: "Gemini's response was cut off before it was complete." } };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: { kind: "invalid_output", message: "Gemini returned a response that was not valid JSON." } };
      }
      const result = req.schema.safeParse(parsed);
      // Log which fields failed (paths and rule only — never content) to tune schemas.
      if (!result.success) console.warn("[ai] schema mismatch", result.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`).join("; "));
      if (!result.success) return { ok: false, error: { kind: "invalid_output", message: "Gemini's response did not match the expected structure." } };

      return {
        ok: true,
        data: result.data,
        model: options.model,
        usage: { inputTokens: json.usageMetadata?.promptTokenCount, outputTokens: json.usageMetadata?.candidatesTokenCount },
      };
    },
  };
}
