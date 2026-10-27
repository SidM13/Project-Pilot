// Connectivity check for the Supabase settings in .env.local.
// Prints only structure, lengths and HTTP status codes — never credential values.
// Usage: npm run check:supabase
import nextEnv from "@next/env";

const { combinedEnv: env } = nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const keyName = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY";

let host = "";
try { host = new URL(url).host; } catch {}
const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1];
const kind = key.startsWith("sb_publishable_") ? "publishable" : key.startsWith("sb_secret_") ? "secret" : key.split(".").length === 3 ? "legacy-jwt" : "unknown";

console.log(`URL:  ${ref ? "valid https://<project-ref>.supabase.co" : "INVALID — expected https://<20-char-ref>.supabase.co with no path"}`);
console.log(`Key:  ${key ? `${keyName} (${kind}, ${key.length} chars)` : "MISSING"}`);
if (kind === "secret") console.log("      ✗ This is a secret key. The app needs the publishable key; secret keys must never reach the browser.");
if (kind === "legacy-jwt") {
  try {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    console.log(`      JWT role ${claims.role}; project ${claims.ref === ref ? "matches the URL" : "DOES NOT match the URL"}`);
  } catch { console.log("      JWT payload unreadable (truncated copy?)"); }
}
if (!ref || !key) process.exit(1);

const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
const body = await res.json().catch(() => ({}));
if (res.ok) {
  console.log(`API:  ✓ HTTP ${res.status} — key accepted by this project`);
  const rest = await fetch(`${url}/rest/v1/workspaces?select=id&limit=1`, { headers: { apikey: key } });
  const r = await rest.json().catch(() => ({}));
  console.log(`DB:   ${rest.ok ? "✓ schema present (workspaces table reachable)" : r.code === "42P01" || r.code === "PGRST205" ? "schema not applied yet — run npm run db:push" : `HTTP ${rest.status} ${r.message ?? ""}`}`);
} else {
  console.log(`API:  ✗ HTTP ${res.status} — ${body.message ?? body.msg ?? "rejected"}`);
  if (res.status === 401) console.log("      The project is reachable but does not recognise this key: it belongs to another project, was revoked, or was copied incompletely.");
  process.exit(1);
}
