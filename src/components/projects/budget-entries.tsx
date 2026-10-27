"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addBudgetEntry, deleteBudgetEntry } from "@/actions/budget";
import { formatDate, formatMoney } from "@/lib/format";
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, type BudgetCategory, type BudgetEntry, type Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Field } from "@/components/system/field";
import { NativeSelect } from "@/components/system/native-select";
import { EmptyState } from "@/components/system/states";
import { useActionForm } from "@/components/system/use-action-form";

export function BudgetEntries({ projectId, entries, tasks, currency, defaultDate }: { projectId: string; entries: BudgetEntry[]; tasks: Task[]; currency: string; defaultDate: string }) {
  const [adding, setAdding] = useState(false);
  const blank = { entry_date: defaultDate, amount: "", category: "labor" as BudgetCategory, note: "", task_id: "" };
  const [v, setV] = useState(blank);
  const { pending, errors, submit } = useActionForm();
  const del = useActionForm();
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Recorded expenditure</h2>
        {!adding && <Button onClick={() => { setV(blank); setAdding(true); }}><Plus /> Record spend</Button>}
      </div>
      {adding && (
        <form
          noValidate
          className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[150px_140px_140px_minmax(0,1fr)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => addBudgetEntry(projectId, v), { success: "Spend recorded", onSuccess: () => setAdding(false) });
          }}
        >
          <Field label="Date" htmlFor="b-date" error={errors.entry_date}>
            <Input id="b-date" type="date" value={v.entry_date} onChange={set("entry_date")} />
          </Field>
          <Field label={`Amount (${currency})`} htmlFor="b-amount" error={errors.amount}>
            <Input id="b-amount" inputMode="decimal" value={v.amount} onChange={set("amount")} aria-invalid={!!errors.amount} />
          </Field>
          <Field label="Category" htmlFor="b-cat">
            <NativeSelect id="b-cat" value={v.category} onChange={set("category")}>
              {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{BUDGET_CATEGORY_LABELS[c]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Note" htmlFor="b-note" error={errors.note}>
            <Input id="b-note" value={v.note} onChange={set("note")} maxLength={300} placeholder="e.g. October timesheets" />
          </Field>
          <Field label="Task (optional)" htmlFor="b-task" className="sm:col-span-2">
            <NativeSelect id="b-task" value={v.task_id} onChange={set("task_id")}>
              <option value="">Not linked to a task</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record"}</Button>
          </div>
        </form>
      )}
      {entries.length === 0 ? (
        <EmptyState title="No spend recorded" description="Actual cost is the sum of recorded entries. Record timesheet costs, vendor invoices and licences here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-subtle text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="w-10 px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-subtle">
                  <td className="tabular px-3 py-2 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                  <td className="px-3 py-2">{BUDGET_CATEGORY_LABELS[e.category]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.note || "—"}
                    {e.task_id && <span className="block text-xs">Task: {taskTitle.get(e.task_id) ?? "deleted task"}</span>}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(e.amount, currency)}</td>
                  <td className="px-3 py-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label="Delete entry" disabled={del.pending}><Trash2 /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                          <AlertDialogDescription>{formatMoney(e.amount, currency)} will be removed from actual cost. The deletion is recorded in the activity history.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.submit(() => deleteBudgetEntry(e.id), { success: "Entry deleted" })}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
