import type { GroundedResult } from "@/lib/ai/service";
import { allowedFigures, findUngroundedFigures, outputTexts } from "@/lib/ai/grounding";
import type { BriefNarrative, SimulationExplanation } from "@/lib/ai/prompts";
import type { z } from "zod";

// Static (GitHub Pages) replacement for lib/ai/service.ts. Live Gemini calls are
// disabled in the public demo. Instead, two outputs recorded from real Gemini runs
// (gemini-3.5-flash-lite, Oct 27 2026) on the demo's flagship scenario are offered as
// clearly labelled examples — and only when the visitor's current data still produces
// that scenario with exactly the figures the example cites. Otherwise: an honest
// "unavailable" message. Nothing is ever generated or fabricated here.

export const EXAMPLE_MODEL = "gemini-3.5-flash-lite · pre-generated example";
const SCENARIO_CHANGE = 'Task "System integration testing": owner Tom Becker → Jordan Ruiz';
const PROJECT = "Client ERP Implementation";

const SIMULATION_EXAMPLE: SimulationExplanation = {
  summary: "This scenario reassigns the task System integration testing from Tom Becker to Jordan Ruiz. The forecast helps by pulling the finish date closer to the target.",
  schedule: "The forecast finish date moves from Dec 28 to Dec 23, reducing working days late from 6 to 3. The milestone Data migration complete stays at Dec 8, UAT sign-off moves from Dec 22 to Dec 17, and Go-live moves from Dec 28 to Dec 23.",
  budget: "The projected cost increases by $320 from $154,240 to $154,560, and the budget variance increases negatively from -$6,240 to -$6,560 against the $148,000 budget.",
  resources: "Tom Becker, in Quality with 24 hours/week capacity and a $95/h rate, is replaced on the task by Jordan Ruiz, in Engineering with 40 hours/week capacity and a $105/h rate. There is no stated effect on other projects.",
  risks: [
    "Jordan Ruiz is in Engineering, which is outside the current owner's discipline of Quality; confirm they can do this work.",
    "The remaining estimate of 32 hours may be incorrect if Jordan Ruiz needs a ramp-up period despite the assumption that no ramp-up is needed.",
    "Remaining hours are re-costed at $105/h instead of $95/h, which increases project cost.",
    "The forecast relies on stated weekly capacity and recorded remaining hours without applying historical velocity.",
  ],
  tradeOffs: [
    "A gain of 3 working days recovered on the schedule versus a cost of $320 added to the projected cost.",
    "A gain of moving the UAT sign-off and Go-live dates closer to the target versus a cost of increasing the negative budget variance.",
  ],
  alternatives: [
    "Address the 1 blocked task that is scheduled to resume on its recorded expected to clear date.",
    "Review tasks at risk, as there are 6 tasks currently at risk in both current and proposed states.",
    "Examine constrained people such as Tom Becker and Jordan Ruiz regarding their weekly capacity and discipline alignment.",
  ],
};

const BRIEF_EXAMPLE: BriefNarrative = {
  executiveSummary:
    "The Client ERP Implementation project for Halden Manufacturing is in critical health with a health score of 27 and progress at 52%. The forecast finish is Dec 28, which is 6 working days late against the Dec 18 target, and the project is forecast to finish $6,240 over the $148,000 budget. A decision is required regarding the Kestrel WMS vendor integration blocker, resource over-allocation for Marcus Lee, and the $6,240 budget overrun.",
  recommendation:
    "Escalate the Kestrel WMS vendor integration blocker to bring it forward to Nov 17 or earlier, and re-baseline Data migration complete or remove its dependency if needed. Raise a change request with Halden Manufacturing for the $6,240 forecast overrun or reduce scope. To address Marcus Lee being at 108% capacity, defer Legacy form integrations or move its due date and confirm the trade-off with the client, as no Engineering team member has spare capacity.",
  risks: [
    "Kestrel WMS vendor integration is blocked because Kestrel has not delivered sandbox credentials for the inventory endpoint, with 30 hours remaining of 80 hours planned.",
    "Marcus Lee is booked at 108% of capacity across 2 projects, with 86 hours assigned vs 80 hours available between Nov 16 and Nov 27.",
    "The project is forecast to finish $6,240 over budget, with $124,710 spent of the $148,000 budget and remaining work costed at $29,530.",
    "Data migration complete is forecast 7 working days late to Dec 8, UAT sign-off to Dec 22, and Go-live to Dec 28.",
    "Assumes Jordan Ruiz works at stated 40 hours per week with no ramp-up, remaining hours are re-costed at $105/h, and Jordan Ruiz can perform Quality discipline work.",
  ],
  clientMessage:
    "Project progress for Client ERP Implementation is currently at 52% with a forecast finish of Dec 28 against the target of Dec 18. We are managing a vendor integration dependency with Kestrel and addressing a forecast cost variance of $6,240. We will keep you updated as we work through these items.",
};

const EXAMPLES = {
  simulation: { output: SIMULATION_EXAMPLE, generatedAt: "2026-10-27T20:32:00.000Z" },
  brief: { output: BRIEF_EXAMPLE, generatedAt: "2026-10-27T20:48:00.000Z" },
};

/** Whether the visitor's current context is the scenario the example was recorded for. */
function matchesScenario(kind: "simulation" | "brief", context: unknown): boolean {
  const c = context as { project?: { name?: string }; scenario?: { changes?: string[] } | null };
  return c.project?.name === PROJECT && !!c.scenario?.changes?.includes(SCENARIO_CHANGE) && (kind === "simulation" || c.scenario !== null);
}

const DISABLED =
  "Live AI is turned off in this public demo, so nothing is generated here. A pre-generated Gemini example is available for the flagship scenario — Client ERP Implementation, reassigning “System integration testing” from Tom Becker to Jordan Ruiz — on unmodified demo data (use “Reset demo data” if you have made changes).";

export async function runGrounded<T>(req: { kind: "simulation" | "brief"; context: unknown; schema: z.ZodType<T> }): Promise<GroundedResult<T>> {
  const example = EXAMPLES[req.kind];
  const parsed = req.schema.safeParse(example.output);
  const stillAccurate = parsed.success && findUngroundedFigures(outputTexts(example.output), allowedFigures(req.context)).length === 0;
  if (!parsed.success || !matchesScenario(req.kind, req.context) || !stillAccurate) {
    return { ok: false, error: { kind: "not_configured", message: DISABLED } };
  }
  return { ok: true, data: parsed.data, model: EXAMPLE_MODEL, cached: true, generatedAt: example.generatedAt };
}
