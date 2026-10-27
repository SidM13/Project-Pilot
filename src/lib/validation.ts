import { z } from "zod";
import { BUDGET_CATEGORIES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

// Shared by client forms (instant feedback) and server actions (authoritative).

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalDate = z.union([isoDate, z.literal("")]).transform((v) => v || null);
const optionalId = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);
const hours = (label: string) =>
  z.coerce.number<string | number>({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(9999);

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    client_name: z.string().trim().max(120),
    description: z.string().trim().max(2000),
    owner_member_id: optionalId,
    status: z.enum(PROJECT_STATUSES),
    start_date: isoDate,
    target_date: isoDate,
    budget: z.coerce.number<string | number>({ error: "Budget must be a number" }).min(0, "Budget cannot be negative").max(1e10),
  })
  .refine((p) => p.target_date >= p.start_date, { message: "Target date must be on or after the start date", path: ["target_date"] });

export const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(4000),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(PRIORITIES),
    is_critical: z.boolean(),
    assignee_id: optionalId,
    milestone_id: optionalId,
    start_date: optionalDate,
    due_date: optionalDate,
    planned_hours: hours("Planned hours").refine((n) => n > 0, "Planned hours must be greater than 0"),
    actual_hours: hours("Actual hours"),
    remaining_hours: z
      .union([z.literal(""), hours("Remaining hours")])
      .transform((v) => (v === "" ? null : v)),
    blocked_reason: z.string().trim().max(1000),
    blocked_until: optionalDate,
  })
  .transform((t) => (t.status === "blocked" ? t : { ...t, blocked_until: null }))
  .refine((t) => !t.start_date || !t.due_date || t.due_date >= t.start_date, {
    message: "Due date must be on or after the start date",
    path: ["due_date"],
  });

/** Quick inline progress update from the task table. */
export const taskProgressSchema = z.object({
  status: z.enum(TASK_STATUSES),
  actual_hours: hours("Actual hours"),
  remaining_hours: z.union([z.literal(""), hours("Remaining hours")]).transform((v) => (v === "" ? null : v)),
});

export const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  due_date: isoDate,
});

export const dependencySchema = z.object({ task_id: z.uuid(), depends_on_id: z.uuid() });

export const budgetEntrySchema = z.object({
  entry_date: isoDate,
  amount: z.coerce.number<string | number>({ error: "Amount must be a number" }).positive("Amount must be greater than 0").max(1e10),
  category: z.enum(BUDGET_CATEGORIES),
  note: z.string().trim().max(300),
  task_id: optionalId,
});

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  role_title: z.string().trim().max(80),
  discipline: z.string().trim().max(40),
  weekly_capacity_hours: z.coerce.number<string | number>({ error: "Capacity must be a number" }).min(0).max(80, "At most 80 h per week"),
  hourly_cost: z
    .union([z.literal(""), z.coerce.number<string | number>({ error: "Cost must be a number" }).min(0)])
    .transform((v) => (v === "" ? null : v)),
  active: z.boolean(),
});

export const scenarioSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reassign"), taskId: z.uuid(), toMemberId: z.uuid() }),
  z.object({ kind: z.literal("deadline"), target: z.enum(["project", "milestone"]), targetId: z.uuid(), newDate: isoDate }),
  z.object({ kind: z.literal("scope"), taskIds: z.array(z.uuid()).min(1, "Select at least one task").max(100) }),
]);

export const simulationInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Name the scenario").max(120),
  scenario: scenarioSchema,
});

export const workspaceNameSchema = z.string().trim().min(1, "Name is required").max(120);

export type ProjectInput = z.input<typeof projectSchema>;
export type TaskInput = z.input<typeof taskSchema>;
export type TaskProgressInput = z.input<typeof taskProgressSchema>;
export type MilestoneInput = z.input<typeof milestoneSchema>;
export type BudgetEntryInput = z.input<typeof budgetEntrySchema>;
export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type SimulationInput = z.input<typeof simulationInputSchema>;

/** First error per field, for inline form messages. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
