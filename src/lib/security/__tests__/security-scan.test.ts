import { describe, expect, it } from "vitest";
import { isForbiddenFile, PUBLIC_BUILD_RULES, RULES, scanText } from "../../../../scripts/security-scan.mjs";

// Test inputs are assembled at runtime so this file never contains a credential-shaped string.
const fake = (prefix: string, n: number, ch = "a") => prefix + ch.repeat(n);
const rulesHit = (text: string, rules = RULES) => scanText(text, rules).map((f: { rule: string }) => f.rule);

describe("secret scanner", () => {
  it.each([
    ["google-api-key", fake("AI" + "za", 35)],
    ["google-access-token", fake("AQ" + ".", 40)],
    ["supabase-secret-key", fake("sb_" + "secret_", 30)],
    ["supabase-publishable-key", fake("sb_" + "publishable_", 30)],
    ["jwt", `${fake("ey" + "J", 20)}.${fake("ey" + "J", 20)}.${fake("", 20)}`],
    ["github-token", fake("gh" + "p_", 36)],
    ["private-key", "-----BEGIN " + "PRIVATE KEY-----"],
    ["database-url-with-password", "postgresql://postgres.ref:" + "S3cretPa55" + "@aws-0-x.pooler.supabase.com:5432/postgres"],
    ["secret-env-assignment", "GEMINI_API_KEY=" + "realvalue123456"],
  ])("detects %s", (rule, text) => {
    expect(rulesHit(text)).toContain(rule);
  });

  it("accepts documented placeholders", () => {
    for (const line of [
      "SUPABASE_SECRET_KEY=" + "sb_secret_...",
      "DEMO_PASSWORD=change-me-to-a-long-random-string",
      "SUPABASE_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-region.pooler.supabase.com:5432/postgres",
      "# GEMINI_API_KEY=",
    ]) expect(rulesHit(line)).toEqual([]);
  });

  it("flags Supabase and Gemini endpoints in the public build", () => {
    expect(rulesHit(fake("https://", 20, "b") + ".supabase.co", PUBLIC_BUILD_RULES)).toContain("supabase-project-url");
    expect(rulesHit("fetch('https://generativelanguage.googleapis.com')", PUBLIC_BUILD_RULES)).toContain("gemini-endpoint");
  });

  it("forbids credential-bearing files but allows the placeholder template", () => {
    for (const f of [".env", ".env.local", ".env.production", "config/.env.development.local", "key.pem", ".vercel/project.json"]) expect(isForbiddenFile(f)).toBe(true);
    expect(isForbiddenFile(".env.local.example")).toBe(false);
    expect(isForbiddenFile("src/lib/env.ts")).toBe(false);
  });
});
