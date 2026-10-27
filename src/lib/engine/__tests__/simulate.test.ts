import { describe, expect, it } from "vitest";
import { analyzeWorkspace } from "../index";
import { simulate, validateScenario, type Scenario } from "../simulate";
import { demoSnapshot } from "./fixtures";

describe("decision simulator", () => {
  it("never modifies the actual snapshot (simulation isolation)", () => {
    const snap = demoSnapshot();
    const before = JSON.stringify(snap);
    const scenarios: Scenario[] = [
      { kind: "reassign", taskId: "e_sit", toMemberId: "jordan" },
      { kind: "deadline", target: "milestone", targetId: "erp_m2", newDate: "2026-12-08" },
      { kind: "deadline", target: "project", targetId: "erp", newDate: "2026-12-31" },
      { kind: "scope", taskIds: ["e_monitor"] },
    ];
    for (const s of scenarios) simulate(snap, "erp", s);
    expect(JSON.stringify(snap)).toBe(before);
    // And the live analysis is unchanged afterwards.
    expect(analyzeWorkspace(snap).forecast.projects.get("erp")?.finish).toBe("2026-12-28");
  });

  it("reallocation: a full-time tester on integration testing pulls Go-live in at a cost", () => {
    const r = simulate(demoSnapshot(), "erp", { kind: "reassign", taskId: "e_sit", toMemberId: "jordan" });
    expect(r.current.slipWorkingDays).toBe(6);
    expect(r.proposed.slipWorkingDays!).toBeLessThan(r.current.slipWorkingDays!);
    // 32 h re-costed from $95/h (Tom) to $105/h (Jordan)
    expect(r.proposed.projectedCost - r.current.projectedCost).toBeCloseTo(320, 2);
    expect(r.changes[0]).toBe('Task "System integration testing": owner Tom Becker → Jordan Ruiz');
    expect(r.assumptions.some((a) => /outside the current owner's discipline/.test(a))).toBe(true);
  });

  it("reallocation reports knock-on effects on other projects that share the person", () => {
    // Moving content migration off Maya frees her for the Operations dashboard, so Ops' forecast moves too.
    const r = simulate(demoSnapshot(), "web", { kind: "reassign", taskId: "w_content", toMemberId: "marcus" });
    const ops = r.portfolio.find((p) => p.projectId === "ops")!;
    expect(ops.after.finish! <= ops.before.finish!).toBe(true);
  });

  it("deadline adjustment changes lateness, not the forecast, and lists downstream effects", () => {
    const r = simulate(demoSnapshot(), "erp", { kind: "deadline", target: "milestone", targetId: "erp_m2", newDate: "2026-12-08" });
    const m2 = (p: typeof r.current) => p.milestones.find((m) => m.id === "erp_m2")!;
    expect(m2(r.current)).toMatchObject({ forecast: "2026-12-08", slip: 7 });
    expect(m2(r.proposed)).toMatchObject({ forecast: "2026-12-08", slip: 0 });
    expect(r.proposed.forecastFinish).toBe(r.current.forecastFinish);
    expect(r.affected.some((a) => /Downstream milestone "UAT sign-off"/.test(a))).toBe(true);
    // Integration testing is planned to start Nov 30 — before the proposed Dec 8 date — so it is a conflict.
    expect(r.affected).toContain('"System integration testing" is planned to start Nov 30, before the new milestone date');
  });

  it("scope reduction removes remaining effort and cost, and frees dependants", () => {
    const r = simulate(demoSnapshot(), "web", { kind: "scope", taskIds: ["w_forms"] });
    expect(r.current.remainingHours - r.proposed.remainingHours).toBe(32);
    expect(r.current.projectedCost - r.proposed.projectedCost).toBeCloseTo(32 * 135, 2);
    expect(r.affected).toContain('"Launch & DNS cutover" no longer waits on deferred work');
  });

  it("rejects scenarios that do not apply", () => {
    const snap = demoSnapshot();
    expect(validateScenario(snap, "erp", { kind: "reassign", taskId: "e_req", toMemberId: "jordan" })).toMatch(/open task/);
    expect(validateScenario(snap, "erp", { kind: "reassign", taskId: "e_sit", toMemberId: "tom" })).toMatch(/already owns/);
    expect(validateScenario(snap, "erp", { kind: "scope", taskIds: [] })).toMatch(/at least one/);
    expect(validateScenario(snap, "erp", { kind: "deadline", target: "project", targetId: "erp", newDate: "2026-01-01" })).toMatch(/before the project start/);
    expect(() => simulate(snap, "erp", { kind: "scope", taskIds: ["w_forms"] })).toThrow(/Only unfinished tasks in this project/);
  });
});
