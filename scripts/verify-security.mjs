// End-to-end check of database-level isolation and integrity rules against the
// configured Supabase project. Creates two throwaway users, runs the checks as
// each of them through the public (anon-key) API, then deletes everything.
// Usage: npm run verify:security
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SECRET_KEY,
} = process.env;
// Newer Supabase key names (sb_secret_… / sb_publishable_…) and legacy JWT keys both work.
const serviceKey = SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY;
const anonKey = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const password = `Verify-${stamp}-pw!`;
const created = [];
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function userClient(label) {
  const email = `rls-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return client;
}

try {
  const a = await userClient("a");
  const b = await userClient("b");

  const { data: wsA, error: wsErr } = await a.rpc("create_workspace", { p_name: "RLS check A" });
  if (wsErr) throw wsErr;
  const { data: wsB } = await b.rpc("create_workspace", { p_name: "RLS check B" });

  const { data: projA, error: pErr } = await a
    .from("projects")
    .insert({ workspace_id: wsA, name: "Secret project", start_date: "2026-11-02", target_date: "2026-12-18", budget: 1000 })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const { data: tasksA, error: tErr } = await a
    .from("tasks")
    .insert([
      { workspace_id: wsA, project_id: projA.id, title: "First" },
      { workspace_id: wsA, project_id: projA.id, title: "Second" },
    ])
    .select("id");
  if (tErr) throw tErr;
  const [t1, t2] = tasksA.map((t) => t.id);

  // ── Isolation ──
  const { data: seen } = await b.from("projects").select("id").eq("id", projA.id);
  check("B cannot read A's project", seen?.length === 0);

  const { data: seenWs } = await b.from("workspaces").select("id").eq("id", wsA);
  check("B cannot read A's workspace", seenWs?.length === 0);

  const { data: upd } = await b.from("projects").update({ name: "pwned" }).eq("id", projA.id).select("id");
  check("B cannot update A's project", (upd?.length ?? 0) === 0);

  const { error: insErr } = await b.from("tasks").insert({ workspace_id: wsA, project_id: projA.id, title: "Injected" });
  check("B cannot insert a task into A's workspace", !!insErr, "insert succeeded");

  const { error: crossErr } = await b.from("tasks").insert({ workspace_id: wsB, project_id: projA.id, title: "Cross-linked" });
  check("B cannot attach a task in B's workspace to A's project", !!crossErr, "insert succeeded");

  const { error: memberErr } = await b.from("workspace_members").insert({ workspace_id: wsA, user_id: created[1], role: "owner" });
  check("B cannot add themself to A's workspace", !!memberErr, "insert succeeded");

  const { error: seedErr } = await b.rpc("seed_demo_workspace", { ws: wsB });
  check("Demo seed refuses a non-demo workspace", !!seedErr, "seed ran");

  // ── Integrity ──
  const { error: d1 } = await a.from("task_dependencies").insert({ workspace_id: wsA, project_id: projA.id, task_id: t2, depends_on_id: t1 });
  check("A can add a valid dependency", !d1, d1?.message);
  const { error: cycle } = await a.from("task_dependencies").insert({ workspace_id: wsA, project_id: projA.id, task_id: t1, depends_on_id: t2 });
  check("Database rejects a circular dependency", !!cycle && /dependency_cycle/.test(cycle.message), cycle?.message ?? "insert succeeded");

  const { data: doneTask } = await a.from("tasks").update({ status: "done", remaining_hours: 5 }).eq("id", t1).select("completed_at, remaining_hours").single();
  check("Completing a task sets completed_at and zeroes remaining hours", !!doneTask?.completed_at && Number(doneTask.remaining_hours) === 0);

  // ── Simulations (Stage 3) ──
  const simRow = { workspace_id: wsA, project_id: projA.id, name: "What-if", kind: "scope", scenario: { kind: "scope", taskIds: [t2] }, result: {}, reference_date: "2026-11-16" };
  const { data: sim, error: simErr } = await a.from("simulations").insert(simRow).select("id").single();
  check("A can save a draft simulation", !simErr, simErr?.message);
  const { data: simSeen } = await b.from("simulations").select("id").eq("id", sim?.id ?? "00000000-0000-0000-0000-000000000000");
  check("B cannot read A's simulations", simSeen?.length === 0);
  const { error: applyErr } = await a.from("simulations").update({ status: "applied", applied_at: new Date().toISOString(), applied_by: created[0] }).eq("id", sim?.id);
  check("A can mark a draft applied", !applyErr, applyErr?.message);
  const { data: reopened } = await a.from("simulations").update({ status: "draft", applied_at: null, applied_by: null }).eq("id", sim?.id).select("id");
  check("Applied simulations cannot be edited", (reopened?.length ?? 0) === 0);
  const { data: deletedApplied } = await a.from("simulations").delete().eq("id", sim?.id).select("id");
  check("Applied simulations cannot be deleted", (deletedApplied?.length ?? 0) === 0);

  // ── AI layer (Stage 4) ──
  const { data: brief, error: briefErr } = await a.from("decision_briefs").insert({ workspace_id: wsA, project_id: projA.id, title: "Brief", facts: {}, narrative: {}, ai_meta: {} }).select("id").single();
  check("A can create a brief", !briefErr, briefErr?.message);
  const { data: briefSeen } = await b.from("decision_briefs").select("id").eq("id", brief?.id ?? "00000000-0000-0000-0000-000000000000");
  check("B cannot read A's briefs", briefSeen?.length === 0);
  const { error: cacheErr } = await b.from("ai_explanations").insert({ workspace_id: wsA, project_id: projA.id, kind: "brief", input_hash: "0".repeat(64), model: "m", prompt_version: "v", output: {} });
  check("B cannot write AI cache entries into A's workspace", !!cacheErr, "insert succeeded");

  // ── Hardening (0006) ──
  const { error: demoFlagErr } = await a.from("workspaces").update({ is_demo: true }).eq("id", wsA);
  check("Members cannot mark a workspace as demo", !!demoFlagErr, "update succeeded");
  const { error: renameErr } = await a.from("workspaces").update({ name: "RLS check A renamed" }).eq("id", wsA);
  check("Members can still rename their workspace", !renameErr, renameErr?.message);
  const { error: factsErr } = await a.from("decision_briefs").update({ facts: { tampered: true } }).eq("id", brief?.id);
  check("Brief facts cannot be edited", !!factsErr, "update succeeded");
  const { error: narrErr } = await a.from("decision_briefs").update({ narrative: { executiveSummary: "Edited" } }).eq("id", brief?.id);
  check("Brief narrative can be edited", !narrErr, narrErr?.message);
  const { error: actErr } = await a.from("activity_events").update({ summary: "rewritten" }).eq("workspace_id", wsA);
  check("Activity history cannot be rewritten", !!actErr, "update succeeded");

  const { error: anonErr, data: anonRows } = await createClient(url, anonKey, { auth: { persistSession: false } }).from("projects").select("id");
  check("Signed-out requests see no rows", !anonErr ? anonRows.length === 0 : true);
} catch (e) {
  console.error("Setup failed:", e.message ?? e);
  failures++;
} finally {
  // Workspaces are not owned by auth.users rows (created_by is set null), so remove them explicitly.
  for (const id of created) {
    const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", id);
    for (const row of data ?? []) await admin.from("workspaces").delete().eq("id", row.workspace_id);
    await admin.auth.admin.deleteUser(id);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll security checks passed");
process.exit(failures ? 1 : 0);
