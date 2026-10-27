import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/engine/simulate";
import { demoSnapshot } from "@/lib/engine/__tests__/fixtures";
import { buildBriefFacts, briefToMarkdown } from "@/lib/briefs/facts";
import { allowedFigures, findUngroundedFigures, outputTexts, simulationContext } from "../grounding";
import { simulationPrompt } from "../prompts";

const snap = demoSnapshot();
const result = simulate(snap, "erp", { kind: "reassign", taskId: "e_sit", toMemberId: "jordan" });
const ctx = simulationContext(snap, result);
const allowed = allowedFigures(ctx);

describe("simulation context", () => {
  it("contains only engine figures, with deltas pre-computed", () => {
    expect(ctx.current).toMatchObject({ forecastFinish: "Dec 28", workingDaysLate: 6, projectedCost: "$154,240" });
    expect(ctx.proposed).toMatchObject({ forecastFinish: "Dec 23", workingDaysLate: 3 });
    expect(ctx.change).toMatchObject({ workingDaysLate: -3, projectedCost: "$320" });
    expect(ctx.people.map((p) => p.name).sort()).toEqual(["Jordan Ruiz", "Tom Becker"]);
  });
  it("does not leak record ids into the prompt", () => {
    const prompt = simulationPrompt(ctx);
    for (const id of ["e_sit", "jordan", "erp"]) expect(prompt).not.toContain(`"${id}"`);
    expect(prompt.length).toBeLessThan(6000); // concise: keeps token cost low
  });
});

describe("figure grounding", () => {
  it("accepts text that only uses figures from the context", () => {
    const text = "Moving integration testing to Jordan Ruiz brings the forecast finish from Dec 28 to Dec 23, cutting the delay from 6 to 3 working days for an extra $320. Projected cost becomes $154,560.";
    expect(findUngroundedFigures([text], allowed)).toEqual([]);
  });
  it("rejects invented numbers, amounts and dates", () => {
    const text = "This saves 9 working days and $1,200, finishing on Dec 19 with 85% confidence.";
    expect(findUngroundedFigures([text], allowed).sort()).toEqual(["$1,200", "85", "9", "Dec 19"]);
  });
  it("checks every string in a structured output", () => {
    expect(outputTexts({ a: "x", b: ["y", { c: "z" }], d: 3 })).toEqual(["x", "y", "z"]);
  });
});

describe("decision brief facts", () => {
  const facts = buildBriefFacts(snap, "erp", { name: "Jordan on SIT", status: "draft", result });
  it("summarises status, blockers, decisions, milestones and the scenario from the engine", () => {
    expect(facts.status).toMatchObject({ forecastFinish: "Dec 28", workingDaysLate: 6, budgetVariance: "−$6,240" });
    expect(facts.blockers[0].title).toMatch(/Kestrel WMS vendor integration/);
    expect(facts.decisions[0].problem).toMatch(/Kestrel/);
    expect(facts.milestones.find((m) => m.name === "Data migration complete")).toMatchObject({ forecast: "Dec 8", workingDaysLate: 7 });
    expect(facts.scenario).toMatchObject({ name: "Jordan on SIT", proposed: { forecastFinish: "Dec 23", workingDaysLate: 3 } });
  });
  it("renders calculated and AI sections with distinct labels", () => {
    const md = briefToMarkdown("Brief", facts, { executiveSummary: "Summary.", risks: ["Risk."] }, "AI draft");
    expect(md).toContain("## Status (calculated)");
    expect(md).toContain("## Executive summary (AI draft)");
    expect(md).toContain("## Risks (AI draft)");
    expect(md).not.toContain("Suggested client message");
  });
  it("a brief's facts are a valid grounding context for its narrative", () => {
    const ok = "The project is forecast to finish Dec 28, 6 working days after the Dec 18 target, with a $6,240 overrun.";
    expect(findUngroundedFigures([ok], allowedFigures(facts))).toEqual([]);
  });
});
