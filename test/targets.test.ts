import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildTargets, filterTargetsByRobots } from "@/lib/engine-a/targets";
import { parseRobots } from "@/lib/robots";
import { MAX_TRUST_PAGES } from "@/lib/config";

// robots.txt bodies captured verbatim with curl on 2026-09-01 UTC:
//   fixtures/robots/github.com.txt     https://github.com/robots.txt
//   fixtures/robots/www.notion.so.txt  https://www.notion.so/robots.txt
function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures/robots", name), "utf8");
}

const OUR_TOKEN = "SentinelPostureBot";
const GITHUB_RULES = parseRobots(fixture("github.com.txt"), OUR_TOKEN);
const NOTION_RULES = parseRobots(fixture("www.notion.so.txt"), OUR_TOKEN);

describe("buildTargets", () => {
  const targets = buildTargets("acme.com");

  it("stays within the page cap", () => {
    expect(targets.length).toBeLessThanOrEqual(MAX_TRUST_PAGES);
  });

  it("covers the documented trust surfaces", () => {
    for (const url of [
      "https://acme.com/",
      "https://acme.com/security",
      "https://acme.com/trust",
      "https://acme.com/privacy",
      "https://acme.com/legal",
      "https://acme.com/.well-known/security.txt",
      "https://acme.com/security.txt",
      "https://trust.acme.com/",
      "https://security.acme.com/",
      "https://status.acme.com/",
    ]) {
      expect(targets).toContain(url);
    }
  });

  it("is https only and free of duplicates", () => {
    expect(targets.every((t) => t.startsWith("https://"))).toBe(true);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("emits parseable urls for a host the user pasted with a www label", () => {
    const wwwTargets = buildTargets("www.notion.so");
    expect(wwwTargets).toHaveLength(10);
    for (const url of wwwTargets) {
      expect(new URL(url).protocol).toBe("https:");
    }
  });
});

describe("filterTargetsByRobots", () => {
  it("marks a path the host really disallows on the host that disallowed it", () => {
    // github.com disallows /gist/ in its wildcard group.
    const filtered = filterTargetsByRobots(
      ["https://github.com/gist/", "https://github.com/security", "https://trust.github.com/"],
      new Map([["github.com", GITHUB_RULES]]),
    );
    expect(filtered).toEqual([
      { url: "https://github.com/gist/", allowed: false },
      { url: "https://github.com/security", allowed: true },
      { url: "https://trust.github.com/", allowed: true },
    ]);
  });

  it("applies a wildcard path rule from the captured file", () => {
    const filtered = filterTargetsByRobots(
      ["https://notion.so/en-us/invite/abc", "https://notion.so/privacy"],
      new Map([["notion.so", NOTION_RULES]]),
    );
    expect(filtered).toEqual([
      { url: "https://notion.so/en-us/invite/abc", allowed: false },
      { url: "https://notion.so/privacy", allowed: true },
    ]);
  });

  it("leaves the whole target list reachable on the captured hosts", () => {
    const github = filterTargetsByRobots(
      buildTargets("github.com"),
      new Map([["github.com", GITHUB_RULES]]),
    );
    expect(github.every((entry) => entry.allowed)).toBe(true);
  });

  it("allows a host with no rules on record", () => {
    const filtered = filterTargetsByRobots(["https://acme.com/legal"], new Map());
    expect(filtered).toEqual([{ url: "https://acme.com/legal", allowed: true }]);
  });
});
