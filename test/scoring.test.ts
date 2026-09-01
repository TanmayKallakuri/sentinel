import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCategories, overallScore } from "@/lib/scoring/evaluate";
import { gradeFor, WEIGHTS, SIGNAL_POINTS } from "@/lib/scoring/scoring";
import { SIGNALS } from "@/lib/engine-a/signals";
import type { EngineAResult, EngineBResult, PageVisit } from "@/lib/types";

const PERFECT_A: EngineAResult = {
  signals: SIGNALS.map((s) => ({ id: s.id, label: s.label, found: true, evidence: { url: "https://acme.com/security" } })),
  pages: [],
  screenshots: [],
  robotsRespected: true,
};

const PERFECT_B: EngineBResult = {
  tls: {
    status: "info", negotiatedProtocol: "TLSv1.3", tls13Supported: true, tls12Supported: true,
    legacyProtocolsTestable: false, chainValid: true, verifyMessage: "0 (ok)",
    issuer: "Let's Encrypt", notAfter: "Apr  1 2027 GMT", daysToExpiry: 200,
  },
  headers: {
    status: "info", httpStatus: 200,
    headers: {
      "strict-transport-security": "max-age=63072000; includeSubDomains",
      "content-security-policy": "default-src 'self'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=()",
    },
  },
  email: {
    status: "info",
    spf: { present: true, record: "v=spf1 -all", allQualifier: "-all" },
    dmarc: { present: true, record: "v=DMARC1; p=reject", policy: "reject" },
    dkim: { selectorsTried: ["selector1"], found: ["selector1"] },
  },
  dns: {
    status: "info",
    caa: { present: true, records: ['0 issue "letsencrypt.org"'] },
    dnssec: { present: true, dsRecords: 1, authenticatedData: true },
  },
  ct: { status: "info", source: "crt.sh", total: 3, sample: ["a.acme.com"] },
  tech: { status: "info", software: [], versionDisclosed: false },
};

// Built from the real 301 chains captured with curl, not hand written, so the
// probed URL and landed host are the ones Engine A actually meets.
function offsitePages(): PageVisit[] {
  const file = path.join(__dirname, "fixtures", "redirects", "offsite-status-pages.txt");
  const pages: PageVisit[] = [];
  let requested = "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const req = /^REQUESTED (\S+)/.exec(line);
    if (req?.[1]) requested = req[1];
    const landed = /^LANDED (\S+)/.exec(line);
    if (landed?.[1] && requested) {
      pages.push({
        url: requested,
        status: "redirected_offsite",
        httpStatus: 200,
        redirectedTo: new URL(landed[1]).hostname,
      });
    }
  }
  return pages;
}

describe("gradeFor", () => {
  it.each([[100, "A"], [90, "A"], [89, "B"], [70, "C"], [69, "D"], [50, "D"], [49, "F"], [0, "F"]])(
    "maps %i to %s",
    (score, grade) => expect(gradeFor(score as number)).toBe(grade),
  );
});

describe("buildCategories", () => {
  it("awards a perfect posture 100", () => {
    expect(Math.round(overallScore(buildCategories(PERFECT_A, PERFECT_B)))).toBe(100);
  });

  it("uses the declared weights", () => {
    const categories = buildCategories(PERFECT_A, PERFECT_B);
    for (const category of categories) {
      expect(category.weight).toBe(WEIGHTS[category.id]);
    }
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("makes every point traceable to a named finding", () => {
    for (const category of buildCategories(PERFECT_A, PERFECT_B)) {
      const earned = category.findings.reduce((sum, f) => sum + f.pointsEarned, 0);
      const available = category.findings.reduce((sum, f) => sum + f.pointsAvailable, 0);
      expect(earned).toBe(category.pointsEarned);
      expect(available).toBe(category.pointsAvailable);
      expect(category.findings.every((f) => f.id && f.label && f.observation)).toBe(true);
    }
  });

  it("governance points sum to the governance weight", () => {
    expect(Object.values(SIGNAL_POINTS).reduce((a, b) => a + b, 0)).toBe(WEIGHTS.governance);
  });

  it("scores an absent governance signal at zero without penalising availability", () => {
    const partial: EngineAResult = {
      ...PERFECT_A,
      signals: PERFECT_A.signals.map((s) => (s.id === "soc2" ? { ...s, found: false } : s)),
    };
    const governance = buildCategories(partial, PERFECT_B).find((c) => c.id === "governance");
    expect(governance?.pointsAvailable).toBe(WEIGHTS.governance);
    expect(governance?.pointsEarned).toBe(WEIGHTS.governance - SIGNAL_POINTS.soc2);
  });

  it("excludes an unavailable check from the denominator and records it as not assessed", () => {
    const noDns: EngineBResult = {
      ...PERFECT_B,
      dns: {
        status: "unavailable",
        caa: { present: false, records: [] },
        dnssec: { present: false, dsRecords: 0, authenticatedData: false },
        error: "resolver unreachable",
      },
    };
    const categories = buildCategories(PERFECT_A, noDns);
    const dns = categories.find((c) => c.id === "dns");
    expect(dns?.pointsAvailable).toBe(0);
    expect(dns?.pointsNotAssessed).toBe(WEIGHTS.dns);
    expect(dns?.score).toBe(0);
    // The overall score renormalises over the categories that were assessed,
    // so a resolver outage does not silently downgrade the vendor.
    expect(Math.round(overallScore(categories))).toBe(100);
  });

  it("never claims a target is vulnerable in finding text", () => {
    const withCve: EngineBResult = {
      ...PERFECT_B,
      tech: {
        status: "info",
        versionDisclosed: true,
        software: [{
          product: "nginx", version: "1.18.0", source: "server header",
          cpe: "cpe:2.3:a:nginx:nginx:1.18.0", cveLookup: "performed",
          cves: [{ id: "CVE-2021-23017", cvss: 9.4, severity: "CRITICAL" }],
        }],
      },
    };
    const cve = buildCategories(PERFECT_A, withCve).find((c) => c.id === "cve");
    const text = cve?.findings.map((f) => f.observation).join(" ").toLowerCase() ?? "";
    expect(text).not.toContain("vulnerable");
    expect(text).toContain("associated public cve");
  });
});

describe("governance findings for pages that redirected off-site", () => {
  const github = offsitePages().find((page) => page.url.includes("github.com"));
  const withRedirect: EngineAResult = { ...PERFECT_A, pages: github ? [github] : [] };
  const before = buildCategories(PERFECT_A, PERFECT_B).find((c) => c.id === "governance");
  const after = buildCategories(withRedirect, PERFECT_B).find((c) => c.id === "governance");

  it("read a real captured chain", () => {
    expect(github?.url).toBe("https://status.github.com");
    expect(github?.redirectedTo).toBe("www.githubstatus.com");
  });

  it("emits exactly one unverified finding naming the probed URL and the destination host", () => {
    const unverified = after?.findings.filter((f) => f.status === "unverified") ?? [];
    expect(unverified).toHaveLength(1);
    expect(unverified[0]?.observation).toContain("https://status.github.com");
    expect(unverified[0]?.observation).toContain("www.githubstatus.com");
    expect(unverified[0]?.evidence?.url).toBe("https://status.github.com");
  });

  it("moves neither pointsEarned nor pointsAvailable", () => {
    expect(after?.pointsEarned).toBe(before?.pointsEarned);
    expect(after?.pointsAvailable).toBe(before?.pointsAvailable);
    expect(after?.pointsAvailable).toBe(WEIGHTS.governance);
    expect(after?.pointsNotAssessed).toBe(0);
  });

  it("leaves the governance score identical", () => {
    expect(after?.score).toBe(before?.score);
  });

  it("adds one finding per redirected page and no more", () => {
    const all: EngineAResult = { ...PERFECT_A, pages: offsitePages() };
    const governance = buildCategories(all, PERFECT_B).find((c) => c.id === "governance");
    const unverified = governance?.findings.filter((f) => f.status === "unverified") ?? [];
    expect(unverified).toHaveLength(offsitePages().length);
    expect(new Set(unverified.map((f) => f.id)).size).toBe(unverified.length);
    expect(governance?.score).toBe(before?.score);
  });

  it("never claims the vendor is at fault for the redirect", () => {
    const text = after?.findings.map((f) => f.observation).join(" ").toLowerCase() ?? "";
    expect(text).not.toContain("vulnerable");
    expect(text).not.toContain("insecure");
  });
});
