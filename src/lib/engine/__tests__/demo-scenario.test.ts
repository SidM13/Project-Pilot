import { describe, expect, it } from "vitest";
import { analyzeWorkspace } from "../index";
import { demoSnapshot } from "./fixtures";

// The demo narrative (see CLAUDE.md → Demo). If a seed change breaks one of
// these, the five-minute presentation flow no longer tells the right story.

const a = analyzeWorkspace(demoSnapshot());
const byId = (id: string) => a.projects.find((p) => p.project.id === id)!;

describe("demo workspace narrative", () => {
  it("ranks the ERP vendor blocker as the top decision", () => {
    const top = a.decisions[0];
    expect(top.projectId).toBe("erp");
    expect(top.rule).toBe("blocked_task");
    expect(top.severity).toBe("critical");
    expect(top.problem).toMatch(/Kestrel WMS vendor integration/);
    expect(top.impact?.label).toMatch(/Data migration complete/);
    expect(top.evidence.some((e) => /Database migration/.test(e.text))).toBe(true);
  });

  it("scores ERP critical, Website at risk and Operations on track", () => {
    expect(byId("erp").health.status).toBe("critical");
    expect(byId("web").health.status).toBe("at_risk");
    expect(byId("ops").health.status).toBe("on_track");
  });

  it("shows ERP over budget and Operations with thin headroom", () => {
    expect(byId("erp").cost.variance).toBeLessThan(0);
    expect(byId("ops").cost.variance).toBeGreaterThan(0);
    expect(byId("ops").cost.variancePercent!).toBeLessThan(10);
    expect(byId("ops").findings.map((f) => f.rule)).toContain("budget_headroom");
  });

  it("identifies Maya as the website bottleneck and proposes a same-discipline reassignment", () => {
    const maya = a.loads.find((l) => l.memberId === "maya")!;
    expect(maya.loadPercent).toBe(140);
    const d = a.decisions.find((x) => x.id === "decision:overload:maya")!;
    expect(d.projectId).toBe("web");
    expect(d.action).toMatch(/Content migration \(240 pages\).*to Jordan Ruiz/);
    // The staging milestone risk is folded into the overload decision, not repeated.
    expect(a.decisions.some((x) => x.id.startsWith("decision:milestone_at_risk:web_m2"))).toBe(false);
  });

  it("does not over-commit spare capacity across recommendations", () => {
    const marcus = a.decisions.find((x) => x.id === "decision:overload:marcus");
    if (marcus) expect(marcus.action).not.toMatch(/to Jordan Ruiz/);
  });

  it("produces portfolio metrics from the records", () => {
    expect(a.metrics.activeProjects).toBe(3);
    expect(a.metrics.needingIntervention).toBe(2);
    expect(a.metrics.budgetExposure).toBeCloseTo(-byId("erp").cost.variance, 2);
  });
});
