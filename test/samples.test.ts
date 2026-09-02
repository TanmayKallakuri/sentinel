import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Report } from "@/lib/types";

const DIRECTORY = path.join(process.cwd(), "samples");
const files = readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"));

function load(file: string): Report {
  return JSON.parse(readFileSync(path.join(DIRECTORY, file), "utf8")) as Report;
}

describe("bundled samples", () => {
  it("ships at least three samples", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("spans a range of grades, so the score visibly discriminates", () => {
    const grades = new Set(files.map((f) => load(f).grade));
    expect(grades.size).toBeGreaterThanOrEqual(2);
  });

  it.each(files)("%s is a well formed report", (file) => {
    const report = load(file);
    expect(report.schemaVersion).toBe(1);
    expect(report.categories).toHaveLength(6);
    expect(report.assessedPoints).toBeGreaterThan(0);
  });

  it.each(files)("%s traces every point to a named finding", (file) => {
    for (const category of load(file).categories) {
      const earned = category.findings.reduce((sum, f) => sum + f.pointsEarned, 0);
      const available = category.findings.reduce((sum, f) => sum + f.pointsAvailable, 0);
      expect(earned).toBe(category.pointsEarned);
      expect(available).toBe(category.pointsAvailable);
    }
  });

  it.each(files)("%s scores earned over available across all categories", (file) => {
    const report = load(file);
    const earned = report.categories.reduce((s, c) => s + c.pointsEarned, 0);
    const available = report.categories.reduce((s, c) => s + c.pointsAvailable, 0);
    expect(report.assessedPoints).toBe(available);
    expect(report.overallScore).toBeCloseTo(Math.round((earned / available) * 1000) / 10, 1);
  });

  it.each(files)("%s claims a Certificate Transparency total only if its source answered", (file) => {
    const { subdomains } = load(file);
    if (subdomains.status !== "info") {
      expect(subdomains.total).toBe(0);
      expect(subdomains.sample).toEqual([]);
    }
  });

  // Every name is public in the logs, but an alphabetised list of a named
  // company's hosts, indexed under a graded security banner, is an aggregation
  // the source logs do not offer. A live scan lists them; a published sample
  // carries the count only. A recapture must not quietly put them back.
  it.each(files)("%s publishes a Certificate Transparency count but no names", (file) => {
    const { subdomains } = load(file);
    expect(subdomains.sample).toEqual([]);
    if (subdomains.status === "info") {
      expect(subdomains.total).toBeGreaterThan(0);
      expect(subdomains.source).toBeTruthy();
    }
  });

  it.each(files)("%s references only committed static screenshots", (file) => {
    for (const shot of load(file).screenshots) {
      expect(shot.source).toBe("static");
      expect(shot.dataUrl).toBeUndefined();
      expect(shot.path?.startsWith("/samples/")).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public", shot.path!))).toBe(true);
    }
  });

  it.each(files)("%s carries no secret, local path or infrastructure id", (file) => {
    const raw = readFileSync(path.join(DIRECTORY, file), "utf8");
    expect(raw).not.toMatch(/slr_live_/);
    expect(raw).not.toMatch(/sk-ant-/);
    expect(raw).not.toMatch(/C:\\Users/i);
    expect(raw).not.toMatch(/ktanm/i);
    expect(raw).not.toMatch(/"sandboxId"/);
  });

  // Only Sentinel's own prose is constrained. Evidence is quoted verbatim from
  // the vendor, and a real Content-Security-Policy contains
  // upgrade-insecure-requests, which the report must reproduce faithfully
  // rather than censor.
  it.each(files)("%s never asserts a conclusion in its own words", (file) => {
    const report = load(file);
    const authored = [
      ...report.notes,
      ...report.categories.flatMap((c) => [c.label, ...c.findings.flatMap((f) => [f.label, f.observation])]),
    ].join(" ").toLowerCase();
    expect(authored).not.toContain("vulnerable");
    expect(authored).not.toContain("insecure");
    expect(authored).not.toContain("unsafe");
  });
});
