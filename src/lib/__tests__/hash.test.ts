import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../hash";

describe("sha256Hex", () => {
  it("matches node:crypto for ASCII, unicode and multi-block input", () => {
    for (const s of ["", "abc", "projectpilot-demo:workspace", "Demo — Northwind ✓", "x".repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
});
