// Secret scanner. Fails (exit 1) if credentials or credential-bearing files are found.
// It never prints a matched value — only the rule, file and line.
//
//   node scripts/security-scan.mjs            tracked + untracked (not ignored) files
//   node scripts/security-scan.mjs --history  …plus every commit on every branch
//   node scripts/security-scan.mjs --dir out  a build output (the public GitHub Pages site)
//
// If .env.local exists, its actual values are also searched for (reported by name only).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const PLACEHOLDER = /(\.\.\.|change-me|your-|<[^>]*>|\[your|example|placeholder|^password$)/i;

/** Credential formats. Built from strings so this file never matches itself. */
export const RULES = [
  { id: "google-api-key", re: new RegExp("AIza" + "[0-9A-Za-z_\\-]{35}") },
  { id: "google-access-token", re: new RegExp("\\bAQ\\." + "[A-Za-z0-9_\\-]{30,}") },
  { id: "supabase-secret-key", re: new RegExp("sb_" + "secret_[A-Za-z0-9_\\-]{10,}") },
  { id: "supabase-publishable-key", re: new RegExp("sb_" + "publishable_[A-Za-z0-9_\\-]{10,}") },
  { id: "jwt", re: new RegExp("eyJ[A-Za-z0-9_\\-]{10,}\\." + "eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}") },
  { id: "github-token", re: new RegExp("\\bgh[pousr]_" + "[A-Za-z0-9]{36,}") },
  { id: "llm-api-key", re: new RegExp("\\bsk-(?:ant-|proj-)?" + "[A-Za-z0-9_\\-]{32,}") },
  { id: "private-key", re: new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----") },
  {
    id: "database-url-with-password",
    re: /postgres(?:ql)?:\/\/[^\s:@/'"`]+:([^\s@/'"`]+)@/,
    accept: (m) => PLACEHOLDER.test(m[1]) || m[1].startsWith("$"),
  },
  {
    id: "secret-env-assignment",
    re: /\b(GEMINI_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|DEMO_PASSWORD)\s*=\s*["']?([^\s"'#,;)]{6,})/,
    accept: (m) => PLACEHOLDER.test(m[2]),
  },
];

/** Extra rules for the public static site: nothing that reaches Supabase or Gemini may ship. */
export const PUBLIC_BUILD_RULES = [
  { id: "supabase-project-url", re: /[a-z0-9]{20}\.supabase\.co/ },
  { id: "gemini-endpoint", re: /generativelanguage\.googleapis\.com/ },
  { id: "gemini-key-header", re: /x-goog-api-key/i },
];

const FORBIDDEN_FILE = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.pem|[^/]*\.p12|[^/]*\.key|id_rsa[^/]*|service-account[^/]*\.json|\.vercel\/.*)$/;
const ALLOWED_FILE = /(^|\/)\.env\.local\.example$/;

export function scanText(text, rules = RULES) {
  const findings = [];
  text.split("\n").forEach((line, i) => {
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (m && !(rule.accept && rule.accept(m))) findings.push({ rule: rule.id, line: i + 1 });
    }
  });
  return findings;
}

export function isForbiddenFile(path) {
  return FORBIDDEN_FILE.test(path) && !ALLOWED_FILE.test(path);
}

/** Non-secret settings whose values may legitimately appear in code (e.g. the model name in a label). */
const NOT_SECRET = new Set(["GEMINI_MODEL", "GEMINI_THINKING_BUDGET", "AI_HOURLY_LIMIT", "PROJECTPILOT_DATA_MODE", "DEMO_REFERENCE_DATE", "PAGES_BASE_PATH", "NEXT_BUILD_TARGET"]);

function localSecretValues() {
  if (!existsSync(".env.local")) return [];
  const out = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    const value = m?.[2].replace(/^["']|["']$/g, "");
    if (m && value && value.length >= 8 && !PLACEHOLDER.test(value) && !NOT_SECRET.has(m[1])) out.push({ name: m[1], value });
  }
  return out;
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

function main(argv) {
  const history = argv.includes("--history");
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : null;
  const problems = [];
  const values = localSecretValues();
  const report = (where, rule, line) => problems.push(`${rule} in ${where}${line ? `:${line}` : ""}`);
  const checkValues = (where, text) => values.forEach((v) => text.includes(v.value) && report(where, `value-of-${v.name}`));

  if (dir) {
    if (!existsSync(dir)) throw new Error(`${dir} does not exist`);
    for (const file of walk(dir)) {
      const rel = relative(dir, file);
      if (isForbiddenFile(rel)) report(`${dir}/${rel}`, "credential-file");
      if (rel.endsWith(".map")) report(`${dir}/${rel}`, "source-map-in-public-build");
      const buf = readFileSync(file);
      if (!isText(buf)) continue;
      const text = buf.toString("utf8");
      for (const f of scanText(text, [...RULES, ...PUBLIC_BUILD_RULES])) report(`${dir}/${rel}`, f.rule, f.line);
      checkValues(`${dir}/${rel}`, text);
    }
  } else {
    const tracked = execFileSync("git", ["ls-files"]).toString().split("\n").filter(Boolean);
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"]).toString().split("\n").filter(Boolean);
    for (const file of [...tracked, ...untracked]) {
      if (isForbiddenFile(file)) report(file, "credential-file-not-ignored");
      if (!existsSync(file)) continue;
      const buf = readFileSync(file);
      if (!isText(buf)) continue;
      const text = buf.toString("utf8");
      for (const f of scanText(text)) report(file, f.rule, f.line);
      checkValues(file, text);
    }
    for (const required of [".env", ".env.local", ".env.production", ".env.development.local"]) {
      try {
        execFileSync("git", ["check-ignore", "-q", required]);
      } catch {
        report(".gitignore", `does-not-ignore-${required}`);
      }
    }
    if (history) {
      const log = execFileSync("git", ["log", "--all", "-p", "--no-color", "--format=commit %h"], { maxBuffer: 1 << 30 }).toString("utf8");
      let commit = "";
      let file = "";
      for (const line of log.split("\n")) {
        if (line.startsWith("commit ")) commit = line.slice(7);
        else if (line.startsWith("+++ b/")) {
          file = line.slice(6);
          if (isForbiddenFile(file)) report(`history ${commit}:${file}`, "credential-file-committed");
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
          for (const f of scanText(line.slice(1))) report(`history ${commit}:${file}`, f.rule);
          checkValues(`history ${commit}:${file}`, line);
        }
      }
    }
  }

  const unique = [...new Set(problems)];
  if (unique.length) {
    console.error(`✗ Secret scan failed (${unique.length} finding${unique.length === 1 ? "" : "s"}; values not shown):`);
    unique.forEach((p) => console.error(`  - ${p}`));
    console.error("If a real credential was committed or published, rotate it now — removing it from the code does not make it safe.");
    process.exit(1);
  }
  console.log(`✓ Secret scan passed (${dir ? `build output ${dir}` : history ? "working tree + full git history" : "working tree"}${values.length ? `; also checked ${values.length} local .env.local values by name` : ""})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
