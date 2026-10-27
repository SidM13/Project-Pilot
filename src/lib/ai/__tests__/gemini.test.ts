import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGeminiProvider } from "../gemini";

const schema = z.object({ summary: z.string() });
const req = { system: "s", user: "u", schema, responseSchema: { type: "OBJECT" }, maxOutputTokens: 100 };
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
const ok = (text: string, finishReason = "STOP") => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });

describe("Gemini provider", () => {
  it("sends the key in a header (never the URL) with structured-output config", async () => {
    const fetch = reply(200, ok('{"summary":"fine"}'));
    const p = createGeminiProvider({ apiKey: "test-key", model: "gemini-test", fetch });
    const r = await p.generateJson(req);
    expect(r).toMatchObject({ ok: true, data: { summary: "fine" }, model: "gemini-test", usage: { inputTokens: 10, outputTokens: 5 } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", maxOutputTokens: 100, temperature: 0.2 });
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("maps rate limits with retry hints", async () => {
    const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: reply(429, { error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" }] } }) });
    expect(await p.generateJson(req)).toMatchObject({ ok: false, error: { kind: "rate_limited", retryAfterSeconds: 17 } });
  });

  it.each([
    [503, "unavailable"],
    [403, "rejected"],
    [404, "rejected"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: reply(status, {}) });
    expect(await p.generateJson(req)).toMatchObject({ ok: false, error: { kind } });
  });

  it("recognises Google's HTTP 400 invalid-key response", async () => {
    const body = { error: { code: 400, status: "INVALID_ARGUMENT", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }] } };
    const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: reply(400, body) });
    expect(await p.generateJson(req)).toMatchObject({ ok: false, error: { kind: "rejected", message: expect.stringMatching(/GEMINI_API_KEY/) } });
  });

  it("treats network failures as unavailable", async () => {
    const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
    expect(await p.generateJson(req)).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });

  it("never passes through malformed, truncated, blocked or off-schema output", async () => {
    const cases: [unknown, string][] = [
      [ok("not json"), "invalid_output"],
      [ok('{"summary":"cut', "MAX_TOKENS"), "invalid_output"],
      [ok('{"other":1}'), "invalid_output"],
      [{ promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
      [ok("{}", "SAFETY"), "blocked"],
    ];
    for (const [body, kind] of cases) {
      const p = createGeminiProvider({ apiKey: "k", model: "m", fetch: reply(200, body) });
      expect(await p.generateJson(req)).toMatchObject({ ok: false, error: { kind } });
    }
  });

  it("error messages never contain the API key", async () => {
    const p = createGeminiProvider({ apiKey: "super-secret-value", model: "m", fetch: reply(403, { error: { message: "API key super-secret-value invalid" } }) });
    const r = await p.generateJson(req);
    expect(JSON.stringify(r)).not.toContain("super-secret-value");
  });
});
