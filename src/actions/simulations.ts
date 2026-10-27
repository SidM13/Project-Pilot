"use server";

import { refresh } from "next/cache";
import { getActiveMembership, loadWorkspaceSnapshot } from "@/lib/data/workspace";
import { getReferenceDate } from "@/lib/engine";
import { simulate, validateScenario, type Scenario } from "@/lib/engine/simulate";
import { simulationInputSchema, type SimulationInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionContext, type ActionResult } from "./shared";

// The browser computes comparisons for instant feedback, but the server never
// trusts them: every save or apply re-validates and re-simulates against the
// current records. Applying is the ONLY path from a simulation to real data.

async function computeOnServer(input: SimulationInput) {
  const data = simulationInputSchema.parse(input);
  const { workspace } = await getActiveMembership();
  const snapshot = await loadWorkspaceSnapshot(workspace);
  const scenario = data.scenario as Scenario;
  const error = validateScenario(snapshot, data.projectId, scenario);
  if (error) return { error } as const;
  const referenceDate = getReferenceDate(workspace);
  return { data, scenario, referenceDate, result: simulate(snapshot, data.projectId, scenario, referenceDate) } as const;
}

export async function saveSimulation(input: SimulationInput): Promise<ActionResult<{ id: string }>> {
  try {
    const computed = await computeOnServer(input);
    if ("error" in computed) return { ok: false, error: computed.error! };
    const { data, scenario, referenceDate, result } = computed;
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("simulations")
      .insert({ workspace_id: ctx.workspaceId, project_id: data.projectId, name: data.name, kind: scenario.kind, scenario, result, reference_date: referenceDate })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: data.projectId, entityType: "simulation", entityId: row.id, action: "saved", summary: `Scenario saved (not applied): "${data.name}"` });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

async function writeScenario(ctx: ActionContext, projectId: string, scenario: Scenario) {
  const { supabase } = ctx;
  let error;
  switch (scenario.kind) {
    case "reassign":
      ({ error } = await supabase.from("tasks").update({ assignee_id: scenario.toMemberId }).eq("id", scenario.taskId).eq("project_id", projectId));
      break;
    case "deadline":
      ({ error } =
        scenario.target === "project"
          ? await supabase.from("projects").update({ target_date: scenario.newDate }).eq("id", projectId)
          : await supabase.from("milestones").update({ due_date: scenario.newDate }).eq("id", scenario.targetId).eq("project_id", projectId));
      break;
    case "scope":
      ({ error } = await supabase.from("tasks").update({ deferred_at: new Date().toISOString() }).in("id", scenario.taskIds).eq("project_id", projectId).is("deferred_at", null));
      break;
  }
  if (error) throw error;
}

/** Applies a scenario to the real project records after the user has explicitly approved it. */
export async function applySimulation(input: SimulationInput & { simulationId?: string }): Promise<ActionResult> {
  try {
    const computed = await computeOnServer(input);
    if ("error" in computed) return { ok: false, error: computed.error! };
    const { data, scenario, referenceDate, result } = computed;
    const ctx = await actionContext();

    await writeScenario(ctx, data.projectId, scenario);

    const applied = { status: "applied", applied_at: new Date().toISOString(), applied_by: ctx.userId, result };
    let simulationId = input.simulationId ? uuid.parse(input.simulationId) : null;
    if (simulationId) {
      const { error } = await ctx.supabase.from("simulations").update(applied).eq("id", simulationId).eq("status", "draft");
      if (error) throw error;
    } else {
      const { data: row, error } = await ctx.supabase
        .from("simulations")
        .insert({ workspace_id: ctx.workspaceId, project_id: data.projectId, name: data.name, kind: scenario.kind, scenario, reference_date: referenceDate, ...applied })
        .select("id")
        .single();
      if (error) throw error;
      simulationId = row.id as string;
    }

    await logActivity(ctx, {
      projectId: data.projectId,
      entityType: "simulation",
      entityId: simulationId,
      action: "applied",
      summary: `Approved and applied "${data.name}": ${result.changes.join("; ")}`,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSimulation(simulationId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(simulationId);
    const ctx = await actionContext();
    const { error } = await ctx.supabase.from("simulations").delete().eq("id", id).eq("status", "draft");
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
