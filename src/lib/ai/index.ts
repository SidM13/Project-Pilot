import "server-only";
import { createGeminiProvider } from "./gemini";
import type { AiProvider } from "./types";

// Server-only configuration. GEMINI_* variables have no NEXT_PUBLIC_ prefix, so
// Next.js never inlines them into client bundles; `server-only` makes importing
// this module from a client component a build error.

export const AI_HOURLY_LIMIT = Math.max(1, Number(process.env.AI_HOURLY_LIMIT) || 20);

export function getAiProvider(): AiProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return null;
  const budget = process.env.GEMINI_THINKING_BUDGET;
  return createGeminiProvider({ apiKey, model, thinkingBudget: budget === undefined || budget === "" ? undefined : Number(budget) });
}

export function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
}
