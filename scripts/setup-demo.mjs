// Creates (or refreshes) the isolated demo workspace.
//   1. demo auth user (password synced from .env.local)
//   2. "Demo — Northwind Advisory" workspace pinned to DEMO_REFERENCE_DATE
//   3. demo user as owner, then seed_demo_workspace()
// Usage: npm run demo:setup
// Uses the service-role key; this file is never imported by the application.
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  DEMO_EMAIL: email,
  DEMO_PASSWORD: password,
  DEMO_REFERENCE_DATE: referenceDate = "2026-11-16",
} = process.env;

if (!url || !serviceKey || !email || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL or DEMO_PASSWORD in .env.local");
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
  console.error(`DEMO_REFERENCE_DATE must be YYYY-MM-DD (got "${referenceDate}")`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const must = ({ data, error }, step) => {
  if (error) {
    console.error(`✗ ${step}: ${error.message}`);
    process.exit(1);
  }
  return data;
};

const { users } = must(await admin.auth.admin.listUsers({ perPage: 1000 }), "list users");
let user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (user) {
  must(await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }), "sync demo password");
  console.log(`✓ Demo user exists — password synced (${email})`);
} else {
  ({ user } = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Alex Morgan" } }),
    "create demo user",
  ));
  console.log(`✓ Demo user created (${email})`);
}

const existing = must(
  await admin.from("workspaces").select("id").eq("is_demo", true).eq("created_by", user.id).limit(1),
  "find demo workspace",
);
let workspaceId = existing[0]?.id;
if (workspaceId) {
  must(await admin.from("workspaces").update({ reference_date: referenceDate }).eq("id", workspaceId), "update reference date");
} else {
  ({ id: workspaceId } = must(
    await admin
      .from("workspaces")
      .insert({ name: "Demo — Northwind Advisory", is_demo: true, reference_date: referenceDate, created_by: user.id })
      .select("id")
      .single(),
    "create demo workspace",
  ));
}
must(
  await admin.from("workspace_members").upsert({ workspace_id: workspaceId, user_id: user.id, role: "owner" }),
  "add demo membership",
);
must(await admin.rpc("seed_demo_workspace", { ws: workspaceId }), "seed demo workspace");
console.log(`✓ Demo workspace seeded (reference date ${referenceDate})`);
