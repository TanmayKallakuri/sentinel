import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeDomain } from "@/lib/domain";

// The cookbook example at examples/sentinel duplicates this validator on
// purpose: the two artifacts share no code, by project decision. Duplication
// only stays honest if something keeps checking that the copies still agree, so
// this drives both implementations from one shared input file and fails on any
// divergence.
//
// Both sides read test/fixtures/differential-inputs.txt, and the fork side runs
// in a single spawned process rather than one per input. The per input version
// spawned a Node process for every case and starved past its timeout under CPU
// contention, which is a flake that says nothing about the code under test.
const FORK = process.env.SENTINEL_FORK_PATH
  ?? path.resolve(import.meta.dirname, "..", "..", "solari-cookbook", "examples", "sentinel");
const FORK_INDEX = path.join(FORK, "index.ts");
const TSX = path.join(FORK, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = path.join(import.meta.dirname, "differential-driver.mts");
const INPUTS = path.join(import.meta.dirname, "fixtures", "differential-inputs.txt");

function inputs(): string[] {
  return readFileSync(INPUTS, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function forkVerdicts(): Map<string, string> {
  const stdout = execFileSync(process.execPath, [TSX, DRIVER, FORK_INDEX, INPUTS], {
    cwd: FORK,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  const parsed: { input: string; verdict: string }[] = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "[]");
  return new Map(parsed.map((row) => [row.input, row.verdict]));
}

function appVerdict(input: string): string {
  const result = normalizeDomain(input);
  return result.ok ? `accept ${result.domain}` : "reject";
}

const runnable = existsSync(TSX) && existsSync(FORK_INDEX);

describe.skipIf(!runnable)("fork and app validators agree", () => {
  const fork = runnable ? forkVerdicts() : new Map<string, string>();
  const cases = inputs();

  it("evaluated every shared input", () => {
    expect(fork.size).toBe(cases.length);
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(inputs())("agrees on %s", (input) => {
    expect({ input, verdict: fork.get(input) }).toEqual({ input, verdict: appVerdict(input) });
  });
});

describe.runIf(!runnable)("differential harness", () => {
  it("is skipped because the cookbook example is not installed", () => {
    expect(runnable).toBe(false);
  });
});
