import { promises as fs } from "node:fs";
import path from "node:path";
import type { Report } from "@/lib/types";

const DIRECTORY = path.join(process.cwd(), "samples");

export async function listSampleSlugs(): Promise<string[]> {
  const entries = await fs.readdir(DIRECTORY);
  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

export async function loadSample(slug: string): Promise<Report | null> {
  // Slugs reach here from a route parameter, so the characters are constrained
  // before they are ever joined onto a path.
  if (!/^[a-z0-9.-]+$/i.test(slug) || slug.includes("..")) return null;
  try {
    const raw = await fs.readFile(path.join(DIRECTORY, `${slug}.json`), "utf8");
    return JSON.parse(raw) as Report;
  } catch {
    return null;
  }
}

export async function listSampleSummaries(): Promise<
  { slug: string; grade: string; score: number; assessedPoints: number }[]
> {
  const slugs = await listSampleSlugs();
  const reports = await Promise.all(slugs.map(async (slug) => ({ slug, report: await loadSample(slug) })));
  return reports.flatMap(({ slug, report }) =>
    report
      ? [{ slug, grade: report.grade, score: report.overallScore, assessedPoints: report.assessedPoints }]
      : [],
  );
}
