"use server";

import { refresh } from "next/cache";
import { formatMoney } from "@/lib/format";
import { BUDGET_CATEGORY_LABELS } from "@/lib/types";
import { budgetEntrySchema, type BudgetEntryInput } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "./shared";

export async function addBudgetEntry(projectId: string, input: BudgetEntryInput): Promise<ActionResult> {
  try {
    const pid = uuid.parse(projectId);
    const data = budgetEntrySchema.parse(input);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase
      .from("budget_entries")
      .insert({ ...data, project_id: pid, workspace_id: ctx.workspaceId })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity(ctx, { projectId: pid, entityType: "budget_entry", entityId: row.id, action: "created", summary: `Expenditure recorded: ${formatMoney(data.amount)} ${BUDGET_CATEGORY_LABELS[data.category].toLowerCase()}${data.note ? ` — ${data.note}` : ""}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBudgetEntry(entryId: string): Promise<ActionResult> {
  try {
    const id = uuid.parse(entryId);
    const ctx = await actionContext();
    const { data: row, error } = await ctx.supabase.from("budget_entries").delete().eq("id", id).select("project_id, amount, note").single();
    if (error) throw error;
    await logActivity(ctx, { projectId: row.project_id, entityType: "budget_entry", entityId: null, action: "deleted", summary: `Expenditure removed: ${formatMoney(Number(row.amount))}${row.note ? ` — ${row.note}` : ""}` });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
