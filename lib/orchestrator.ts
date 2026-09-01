import { randomUUID } from "node:crypto";
import { normalizeDomain } from "@/lib/domain";
import { runEngineA } from "@/lib/engine-a";
import { runEngineB } from "@/lib/engine-b";
import { assessedPoints, buildCategories, overallScore } from "@/lib/scoring/evaluate";
import { gradeFor } from "@/lib/scoring/scoring";
import { maybeSummarize } from "@/lib/summary";
import type { EngineAResult, EngineBResult, EngineTiming, Report } from "@/lib/types";

export interface AssembleInput {
  domain: string;
  scanId: string;
  startedAt: number;
  a: EngineAResult | null;
  b: EngineBResult | null;
  timings: EngineTiming[];
}

const EMPTY_A: EngineAResult = { signals: [], pages: [], screenshots: [], robotsRespected: true };

const EMPTY_B: EngineBResult = {
  tls: { status: "unavailable", legacyProtocolsTestable: false, error: "Engine B did not run." },
  headers: { status: "unavailable", headers: {}, error: "Engine B did not run." },
  email: {
    status: "unavailable",
    spf: { present: false },
    dmarc: { present: false },
    dkim: { selectorsTried: [], found: [] },
    error: "Engine B did not run.",
  },
  dns: {
    status: "unavailable",
    caa: { present: false, records: [] },
    dnssec: { present: false, dsRecords: 0, authenticatedData: false },
    error: "Engine B did not run.",
  },
  ct: { status: "unavailable", source: "crt.sh", total: 0, sample: [], error: "Engine B did not run." },
  tech: { status: "unavailable", software: [], versionDisclosed: false, error: "Engine B did not run." },
};

export function assembleReport(input: AssembleInput): Report {
  const a = input.a ?? EMPTY_A;
  const b = input.b ?? EMPTY_B;
  const categories = buildCategories(a, b);
  const score = overallScore(categories);
  const assessed = assessedPoints(categories);

  const notes: string[] = [];
  if (!input.a) notes.push("Engine A did not complete, so no governance signals were collected.");
  if (!input.b) notes.push("Engine B did not complete, so no technical checks were run.");
  if (assessed < 100) {
    notes.push(`This report was assessed on ${assessed} of 100 points. Checks that could not be run are excluded from both the earned and the available side of the score.`);
  }
  for (const category of categories) {
    if (category.pointsNotAssessed > 0) {
      notes.push(`${category.label}: ${category.pointsNotAssessed} of its ${category.weight} points were not assessed and are excluded from the score.`);
    }
  }
  if (a.signals.length > 0) {
    notes.push("Governance signals reflect only the public pages listed in the evidence. Absence of a signal means nothing was found at those locations, not that the control is absent.");
  }

  return {
    schemaVersion: 1,
    scanId: input.scanId,
    domain: input.domain,
    scannedAt: new Date().toISOString(),
    overallScore: Math.round(score * 10) / 10,
    assessedPoints: assessed,
    grade: gradeFor(score),
    categories,
    screenshots: a.screenshots,
    subdomains: b.ct,
    observedSoftware: b.tech.software,
    timings: { totalMs: Date.now() - input.startedAt, engines: input.timings },
    notes,
  };
}

export async function runScan(rawDomain: string): Promise<Report> {
  const validated = normalizeDomain(rawDomain);
  if (!validated.ok) throw new Error(validated.reason);
  const domain = validated.domain;
  const scanId = randomUUID();
  const startedAt = Date.now();

  const timings: EngineTiming[] = [];
  const timed = async <T>(engine: "A" | "B", work: () => Promise<T>): Promise<T | null> => {
    const began = Date.now();
    try {
      const value = await work();
      timings.push({ engine, elapsedMs: Date.now() - began, status: "ok" });
      return value;
    } catch (error) {
      timings.push({
        engine,
        elapsedMs: Date.now() - began,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  // The engines are independent, so they share wall clock time. One failing
  // engine still yields a report built from the other.
  const [a, b] = await Promise.all([
    timed("A", () => runEngineA(domain, scanId)),
    timed("B", () => runEngineB(domain)),
  ]);

  // Scoring is finished and pure before the summary is attached, so the
  // narrative can only ever be added to a report, never change one.
  return maybeSummarize(assembleReport({ domain, scanId, startedAt, a, b, timings }));
}
