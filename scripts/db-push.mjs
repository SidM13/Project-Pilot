// Applies supabase/migrations to the database in SUPABASE_DB_URL (no Docker needed).
// Usage: npm run db:push            (add -- --dry-run to preview)
import { spawnSync } from "node:child_process";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local (Supabase → Project Settings → Database → connection string)");
  process.exit(1);
}
const { status } = spawnSync("npx", ["--yes", "supabase@2", "db", "push", "--db-url", dbUrl, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(status ?? 1);
