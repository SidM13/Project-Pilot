import type { z } from "zod";

// Provider-neutral contract. The app depends on this, never on a vendor SDK,
// so the inference provider can change without touching features.

export type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "unavailable"
  | "invalid_output"
  | "ungrounded"
  | "blocked"
  | "rejected";

export interface AiError {
  kind: AiErrorKind;
  /** Short, user-presentable explanation. Never contains credentials. */
  message: string;
  retryAfterSeconds?: number;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type AiResult<T> = { ok: true; data: T; usage: AiUsage; model: string } | { ok: false; error: AiError };

export interface GenerateJsonRequest<T> {
  system: string;
  user: string;
  /** Authoritative validator for the response. */
  schema: z.ZodType<T>;
  /** JSON schema sent to the provider to constrain output (OpenAPI subset). */
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateJson<T>(request: GenerateJsonRequest<T>): Promise<AiResult<T>>;
}
