// Static (GitHub Pages) replacement for lib/ai/index.ts. There is no Gemini key and
// no network path to Gemini in this build. "Configured" is true only so the UI offers
// the clearly labelled pre-generated examples (see ./service.ts).
export const AI_HOURLY_LIMIT = 0;
export function getAiProvider() {
  return null;
}
export function isAiConfigured() {
  return true;
}
