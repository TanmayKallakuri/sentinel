import { describe, it, expect } from "vitest";
import { assembleReport } from "@/lib/orchestrator";
import type { EngineAResult, EngineBResult } from "@/lib/types";

const EMPTY_A: EngineAResult = { signals: [], pages: [], screenshots: [], robotsRespected: true };

const MINIMAL_B: EngineBResult = {
  tls: { status: "unavailable", legacyProtocolsTestable: false, error: "no handshake" },
  headers: { status: "unavailable", headers: {}, error: "no response" },
  email: {
    status: "unavailable",
    spf: { present: false },
    dmarc: { present: false },
    dkim: { selectorsTried: [], found: [] },
  },
  dns: {
    status: "unavailable",
    caa: { present: false, records: [] },
    dnssec: { present: false, dsRecords: 0, authenticatedData: false },
  },
  ct: { status: "unavailable", source: "crt.sh", total: 0, sample: [] },
  tech: { status: "unavailable", software: [], versionDisclosed: false },
};

describe("assembleReport", () => {
  const report = assembleReport({
    domain: "acme.com",
    scanId: "scan-1",
    startedAt: Date.now() - 5_000,
    a: EMPTY_A,
    b: MINIMAL_B,
    timings: [
      { engine: "A", elapsedMs: 3_000, status: "ok" },
      { engine: "B", elapsedMs: 4_000, status: "ok" },
    ],
  });

  it("stamps identity and schema fields", () => {
    expect(report.schemaVersion).toBe(1);
    expect(report.domain).toBe("acme.com");
    expect(report.scanId).toBe("scan-1");
    expect(report.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("carries a category for every weighted category", () => {
    expect(report.categories.map((c) => c.id).sort()).toEqual(
      ["cve", "dns", "email", "governance", "headers", "transport"],
    );
  });

  it("records per engine timings and a total", () => {
    expect(report.timings.engines).toHaveLength(2);
    expect(report.timings.totalMs).toBeGreaterThan(0);
  });

  it("notes each category that could not be assessed", () => {
    expect(report.notes.some((note) => note.toLowerCase().includes("not assessed"))).toBe(true);
  });

  it("still produces a grade when an engine returned nothing", () => {
    const noEngines = assembleReport({
      domain: "acme.com",
      scanId: "scan-2",
      startedAt: Date.now(),
      a: null,
      b: null,
      timings: [{ engine: "A", elapsedMs: 10, status: "error", error: "launch failed" }],
    });
    expect(noEngines.overallScore).toBe(0);
    expect(noEngines.grade).toBe("F");
    expect(noEngines.notes.join(" ")).toContain("Engine A");
  });
});
