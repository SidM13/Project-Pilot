import { describe, expect, it } from "vitest";
import { analyzeWorkspace } from "../index";
import { answerQuery, classifyQuestion, parseDays, PRIORITY_LIST_SIZE, SUGGESTED_QUESTIONS } from "../copilot";
import { criticalPath } from "../planning";
import { demoSnapshot } from "./fixtures";

const s = demoSnapshot();
const a = analyzeWorkspace(s);

describe("question classification", () => {
  it.each([
    ["Which projects are at risk of missing their deadlines?", "at_risk"],
    ["Can we complete Project A within the remaining budget?", "budget"],
    ["Which tasks should I prioritize this week?", "priorities"],
    ["Which team members are overloaded?", "overloaded"],
    ["How can I reduce project costs without affecting critical deliverables?", "cost_reduction"],
    ["What happens if a milestone is delayed by five days?", "delay"],
    ["Generate a weekly executive project summary", "weekly_summary"],
  ])("%s → %s", (question, intent) => {
    expect(classifyQuestion(question, s)?.intent).toBe(intent);
  });

  it("recognises every suggested question", () => {
    for (const q of SUGGESTED_QUESTIONS) expect(classifyQuestion(q.label, s)?.intent).toBe(q.query.intent);
  });

  it("matches named projects and milestones", () => {
    expect(classifyQuestion("Can we finish the ERP project within budget?", s)).toMatchObject({ intent: "budget", projectId: "erp" });
    expect(classifyQuestion("What happens if Data migration complete is delayed by 2 weeks?", s)).toMatchObject({ intent: "delay", milestoneId: "erp_m2", projectId: "erp", days: 10 });
  });

  it("returns null for questions outside its scope", () => {
    expect(classifyQuestion("Tell me a joke about penguins", s)).toBeNull();
  });

  it("parses delay lengths in working days", () => {
    expect(parseDays("delayed by five days")).toBe(5);
    expect(parseDays("slips 3 working days")).toBe(3);
    expect(parseDays("a week late")).toBe(5);
    expect(parseDays("no number here")).toBeUndefined();
  });
});

describe("deterministic answers", () => {
  it("never mutates the snapshot", () => {
    const before = JSON.stringify(s);
    for (const q of SUGGESTED_QUESTIONS) answerQuery(s, { ...q.query, projectId: "erp", milestoneId: "erp_m2" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("lists the projects forecast to miss their target", () => {
    const r = answerQuery(s, { intent: "at_risk" });
    const late = a.projects.filter((p) => (p.forecastFinish?.slipWorkingDays ?? 0) > 0).map((p) => p.project.name);
    expect(late).toContain("Client ERP Implementation");
    for (const name of late) expect(r.headline).toContain(name);
    expect(r.forecasts.some((l) => l.tone === "critical" && /^Client ERP Implementation: forecast finish/.test(l.text))).toBe(true);
    expect(r.assumptions.length).toBeGreaterThan(0);
  });

  it("compares cost to complete with the remaining budget", () => {
    const r = answerQuery(s, { intent: "budget", projectId: "erp" });
    const erp = a.projects.find((p) => p.project.id === "erp")!.cost;
    const gap = erp.estimateToComplete - (erp.budget - erp.actualCost);
    expect(gap).toBeGreaterThan(0);
    expect(r.headline).toMatch(/Client ERP Implementation is forecast to overrun/);
    expect(r.forecasts.some((l) => l.tone === "critical")).toBe(true);
    expect(r.recommendations).toHaveLength(1);
  });

  it("names everyone above 100% load as overloaded", () => {
    const r = answerQuery(s, { intent: "overloaded" });
    const over = a.loads.filter((l) => l.loadPercent > 100);
    expect(over.length).toBeGreaterThan(0);
    for (const l of over) expect(r.headline).toContain(`${l.name} (${l.loadPercent}%)`);
  });

  it("ranks a bounded list of priorities with stated reasons", () => {
    const r = answerQuery(s, { intent: "priorities" });
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.facts.length).toBeLessThanOrEqual(PRIORITY_LIST_SIZE);
    expect(r.forecasts).toHaveLength(r.facts.length);
    expect(r.headline).toMatch(/^Start with "/);
  });

  it("never proposes changing critical, critical-path or blocked work to save cost", () => {
    const r = answerQuery(s, { intent: "cost_reduction" });
    const protectedTitles = new Set(
      a.projects.flatMap((p) => {
        const chain = new Set(criticalPath(p.project.id, p.facts.tasks, p.facts.dependencies, a.forecast).taskIds);
        return p.facts.tasks.filter((t) => t.is_critical || chain.has(t.id) || t.status === "blocked").map((t) => t.title);
      }),
    );
    const proposed = r.forecasts.flatMap((l) => [...l.text.matchAll(/^(?:Reassign|Defer) "([^"]+)"/g)].map((m) => m[1]));
    for (const title of proposed) expect(protectedTitles.has(title)).toBe(false);
  });

  it("models a milestone delay on a copy and reports the knock-on finish", () => {
    const r = answerQuery(s, { intent: "delay", milestoneId: "erp_m2", projectId: "erp", days: 5 });
    expect(r.title).toBe("Delay: Data migration complete by 5 working days");
    expect(r.headline).toMatch(/5-day delay to "Data migration complete"/);
    expect(r.forecasts[0].text).toMatch(/Dec 8 → Dec 15/); // forecast Dec 8 plus 5 working days
    expect(r.assumptions[0]).toMatch(/5 working day/);
  });

  it("summarises the whole portfolio for the weekly summary", () => {
    const r = answerQuery(s, { intent: "weekly_summary" });
    expect(r.facts[0].text).toMatch(/^3 active project/);
    expect(r.forecasts.some((l) => /Sprint 3 has 26 points committed/.test(l.text))).toBe(true);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });
});
