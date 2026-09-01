import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeDomain } from "@/lib/domain";

// The cookbook example at examples/sentinel duplicates this validator on
// purpose: the two artifacts share no code, by project decision. Duplication
// only stays honest if something keeps checking that the copies still agree,
// so this drives both implementations from one input list and fails on any
// divergence. Task 17 copies the logic a third time and should rerun this.
//
// It shells out once per input, which costs about ten seconds. It runs whenever
// the cookbook example is installed beside this repo and skips cleanly when it
// is not, so a fresh clone of this repo alone still has a green suite. Point it
// elsewhere with SENTINEL_FORK_PATH.
const FORK = process.env.SENTINEL_FORK_PATH
  ?? path.resolve(process.cwd(), "..", "solari-cookbook", "examples", "sentinel");
const TSX = path.join(FORK, "node_modules", "tsx", "dist", "cli.mjs");

const INPUTS = [
  "acme.com", "ACME.com", "https://acme.com/security",
  "http://www.acme.com:8443/a/b?c=d", "sub.domain.acme.co.uk", "a-b.acme.com",
  "acme.com.", "192.168.1.1", "127.0.0.1", "8.8.8.8", "-acme.com", "acme-.com",
  "acme..com", "acme", "localhost", "printer.local", "thing.internal", "acme.c",
  "acme.123", "not a domain", "münchen.de", "https://münchen.de",
  "xn--mnchen-3ya.de", "acme.com?x=1", "https://acme.com?x=1", "acme.com#f",
  "ftp://acme.com", "user:pass@acme.com", "http://[::1]/", "//acme.com",
];

function forkVerdict(input: string): string {
  try {
    const stdout = execFileSync(process.execPath, [TSX, "index.ts", input], {
      cwd: FORK,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const match = /"domain":\s*"([^"]*)"/.exec(stdout);
    return match?.[1] ? `accept ${match[1]}` : "reject";
  } catch {
    // A non zero exit is the example's refusal path, not a harness failure.
    return "reject";
  }
}

function appVerdict(input: string): string {
  const result = normalizeDomain(input);
  return result.ok ? `accept ${result.domain}` : "reject";
}

const runnable = existsSync(TSX);

describe.skipIf(!runnable)("fork and app validators agree", () => {
  it.each(INPUTS)("agrees on %s", (input) => {
    expect({ input, verdict: forkVerdict(input) }).toEqual({ input, verdict: appVerdict(input) });
  }, 30_000);
});

describe.runIf(!runnable)("differential harness", () => {
  it("is skipped because the cookbook example is not installed", () => {
    expect(runnable).toBe(false);
  });
});
