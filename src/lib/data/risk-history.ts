import { sha256Hex } from "@/lib/hash";
import type { ProjectAnalysis, WorkspaceAnalysis } from "@/lib/engine";
import { createClient } from "@/lib/supabase/server";

export interface RiskSnapshot {
  id: string;
  project_id: string;
  reference_date: string;
  health_score: number;
  health_status: "on_track" | "at_risk" | "critical";
  forecast_finish: string | null;
  slip_working_days: number | null;
  budget_variance: number;
  findings: { id: string; rule: string; severity: string; title: string }[];
  created_at: string;
}

function summarize(p: ProjectAnalysis, analysis: WorkspaceAnalysis) {
  const f = analysis.forecast.projects.get(p.project.id);
  return {
    reference_date: analysis.referenceDate,
    health_score: p.health.score,
    health_status: p.health.status,
    forecast_finish: f?.finish ?? null,
    slip_working_days: f?.slipWorkingDays ?? null,
    budget_variance: p.cost.variance,
    findings: p.findings.map((x) => ({ id: x.id, rule: x.rule, severity: x.severity, title: x.title })),
  };
}

/**
 * Appends a snapshot for every live project whose calculated result differs from its latest
 * snapshot. Best-effort: a failure is logged and never blocks the user's change or page view.
 */
export async function recordRiskSnapshots(workspaceId: string, analysis: WorkspaceAnalysis) {
  try {
    const supabase = await createClient();
    const ids = analysis.projects.map((p) => p.project.id);
    if (!ids.length) return;
    const { data: latest, error } = await supabase
      .from("risk_snapshots")
      .select("project_id, result_hash, created_at")
      .in("project_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * 5);
    if (error) throw error;
    const lastHash = new Map<string, string>();
    for (const row of latest ?? []) if (!lastHash.has(row.project_id)) lastHash.set(row.project_id, row.result_hash);

    const rows = analysis.projects.flatMap((p) => {
      const summary = summarize(p, analysis);
      const result_hash = sha256Hex(JSON.stringify(summary));
      return lastHash.get(p.project.id) === result_hash ? [] : [{ ...summary, result_hash, workspace_id: workspaceId, project_id: p.project.id }];
    });
    if (!rows.length) return;
    const { error: insertError } = await supabase.from("risk_snapshots").insert(rows);
    if (insertError) throw insertError;
  } catch (e) {
    console.error("[risk-history]", e);
  }
}

export async function getRiskHistory(projectId: string, limit = 12): Promise<RiskSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("risk_snapshots")
    .select("id, project_id, reference_date, health_score, health_status, forecast_finish, slip_working_days, budget_variance, findings, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, budget_variance: Number(r.budget_variance) })) as RiskSnapshot[];
}
