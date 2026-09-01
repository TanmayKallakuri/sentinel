import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseRobots, isAllowed } from "@/lib/robots";

// Every fixture below is the verbatim body served by the host, captured with
// curl on 2026-09-01 UTC:
//   fixtures/robots/stripe.com.txt          https://stripe.com/robots.txt
//   fixtures/robots/vercel.com.txt          https://vercel.com/robots.txt
//   fixtures/robots/www.notion.so.txt       https://www.notion.so/robots.txt
//   fixtures/robots/github.com.txt          https://github.com/robots.txt
//   fixtures/robots/www.cloudflare.com.txt  https://www.cloudflare.com/robots.txt
function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "fixtures/robots", name), "utf8");
}

const STRIPE = fixture("stripe.com.txt");
const VERCEL = fixture("vercel.com.txt");
const NOTION = fixture("www.notion.so.txt");
const GITHUB = fixture("github.com.txt");
const CLOUDFLARE = fixture("www.cloudflare.com.txt");

const OUR_TOKEN = "SentinelPostureBot";

describe("parseRobots group selection", () => {
  it("applies the group matching our agent token over the wildcard group", () => {
    // stripe.com allows /docs for everyone but disallows it for ia_archiver.
    expect(isAllowed(parseRobots(STRIPE, "ia_archiver"), "/docs")).toBe(false);
    expect(isAllowed(parseRobots(STRIPE, OUR_TOKEN), "/docs")).toBe(true);
  });

  it("honours an agent specific group that disallows the whole site", () => {
    expect(isAllowed(parseRobots(NOTION, "AhrefsBot"), "/")).toBe(false);
    expect(isAllowed(parseRobots(NOTION, "AhrefsBot"), "/security")).toBe(false);
    expect(isAllowed(parseRobots(NOTION, OUR_TOKEN), "/security")).toBe(true);
  });

  it("keeps agent specific rules out of the wildcard group", () => {
    // /gist/ is disallowed only in github.com's wildcard group.
    expect(isAllowed(parseRobots(GITHUB, OUR_TOKEN), "/gist/")).toBe(false);
    expect(isAllowed(parseRobots(GITHUB, "bingbot"), "/gist/")).toBe(true);
    expect(isAllowed(parseRobots(GITHUB, "bingbot"), "/copilot/c/")).toBe(false);
  });

  it("continues a group across a non rule line, so consecutive agents share rules", () => {
    // github.com's baidu group carries only a crawl-delay, which is not a rule
    // line, so the User-agent: * that follows joins the same group.
    expect(parseRobots(GITHUB, "baidu").rules).toEqual(parseRobots(GITHUB, OUR_TOKEN).rules);
  });

  it("falls back to the wildcard group when no agent group matches", () => {
    const cloudflare = parseRobots(CLOUDFLARE, OUR_TOKEN);
    expect(cloudflare.rules).toEqual([{ type: "allow", path: "/" }]);
    expect(cloudflare.source).toBe("fetched");
  });
});

describe("isAllowed longest match wins", () => {
  it("lets an Allow override a broader Disallow", () => {
    // stripe.com: Disallow /docs with Allow /docs/api in the ia_archiver group.
    const stripe = parseRobots(STRIPE, "ia_archiver");
    expect(isAllowed(stripe, "/docs")).toBe(false);
    expect(isAllowed(stripe, "/docs/api")).toBe(true);
  });

  it("lets a wildcard Allow override a broader Disallow", () => {
    // vercel.com: Disallow /api/ with Allow /api/og/* above it.
    const vercel = parseRobots(VERCEL, OUR_TOKEN);
    expect(isAllowed(vercel, "/api/")).toBe(false);
    expect(isAllowed(vercel, "/api/og/cover.png")).toBe(true);
  });

  it("honours a wildcard inside a path pattern", () => {
    // notion.so allows / but disallows /*/invite/, which a prefix compare alone
    // would never match.
    const notion = parseRobots(NOTION, OUR_TOKEN);
    expect(isAllowed(notion, "/")).toBe(true);
    expect(isAllowed(notion, "/invite/abc")).toBe(false);
    expect(isAllowed(notion, "/en-us/invite/abc")).toBe(false);
  });

  it("honours a trailing anchor", () => {
    // github.com: Disallow /search$ but not /search/results.
    const github = parseRobots(GITHUB, OUR_TOKEN);
    expect(isAllowed(github, "/search")).toBe(false);
    expect(isAllowed(github, "/searchable")).toBe(true);
  });

  it("resolves github.com's achievement Allow against its broader tab Disallow", () => {
    const github = parseRobots(GITHUB, OUR_TOKEN);
    expect(isAllowed(github, "/octocat?tab=repositories")).toBe(false);
    expect(isAllowed(github, "/octocat?tab=achievements&achievement=x")).toBe(true);
  });
});

describe("permissive defaults", () => {
  it("allows everything when robots.txt is empty or absent", () => {
    expect(isAllowed(parseRobots("", "AnyBot"), "/anything")).toBe(true);
    expect(isAllowed({ rules: [], source: "absent" }, "/anything")).toBe(true);
  });

  it("treats an empty Disallow value as allow all and stores no rule for it", () => {
    // vercel.com serves a bare "Disallow:" line inside its wildcard group.
    const vercel = parseRobots(VERCEL, OUR_TOKEN);
    expect(VERCEL.split(/\r?\n/)).toContain("Disallow:");
    expect(vercel.rules.some((rule) => rule.path === "")).toBe(false);
    expect(isAllowed(vercel, "/security")).toBe(true);
  });

  it("leaves the fixed trust surface paths reachable on every captured host", () => {
    const trustPaths = [
      "/",
      "/security",
      "/trust",
      "/privacy",
      "/legal",
      "/.well-known/security.txt",
      "/security.txt",
    ];
    for (const body of [STRIPE, VERCEL, NOTION, GITHUB, CLOUDFLARE]) {
      const rules = parseRobots(body, OUR_TOKEN);
      for (const trustPath of trustPaths) {
        expect(isAllowed(rules, trustPath)).toBe(true);
      }
    }
  });
});

describe("line ending robustness", () => {
  it("parses a body converted to CRLF identically", () => {
    for (const body of [STRIPE, VERCEL, NOTION, GITHUB, CLOUDFLARE]) {
      const crlf = body.replace(/\r?\n/g, "\r\n");
      expect(parseRobots(crlf, OUR_TOKEN).rules).toEqual(parseRobots(body, OUR_TOKEN).rules);
    }
  });
});
