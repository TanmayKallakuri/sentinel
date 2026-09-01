import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectSignals, SIGNALS } from "@/lib/engine-a/signals";

// Every fixture is a real page captured over HTTPS, not written by hand. Twice
// in this project a hand written fixture encoded a shape real output never
// produces, the test passed, and the code was broken in production. Each file
// records its source URL, capture date, and extraction method in its header.
function page(name: string): { url: string; text: string } {
  const file = path.join(__dirname, "fixtures", "pages", `${name}.txt`);
  const text = readFileSync(file, "utf8");
  const source = /^# source: (.+)$/m.exec(text)?.[1] ?? name;
  return { url: source, text };
}

const VERCEL_SECURITY = page("vercel-security");
const STRIPE_PRICING = page("stripe-pricing");
const STRIPE_PRIVACY = page("stripe-privacy");
const CLOUDFLARE_TRUST = page("cloudflare-trust");

function found(pages: { url: string; text: string }[]): string[] {
  return detectSignals(pages).filter((r) => r.found).map((r) => r.id).sort();
}

describe("detectSignals shape", () => {
  it("returns one result per signal, in a stable order", () => {
    const results = detectSignals([STRIPE_PRICING]);
    expect(results).toHaveLength(SIGNALS.length);
    expect(results.map((r) => r.id)).toEqual(SIGNALS.map((s) => s.id));
  });

  it("reports absence as a result rather than an omission", () => {
    const results = detectSignals([STRIPE_PRICING]);
    expect(results.every((r) => r.found === false)).toBe(true);
    expect(results.every((r) => typeof r.label === "string" && r.label.length > 0)).toBe(true);
  });

  it("is stateless across repeated calls, so no pattern carries a lastIndex", () => {
    expect(detectSignals([VERCEL_SECURITY])).toEqual(detectSignals([VERCEL_SECURITY]));
  });
});

describe("detectSignals against real captured pages", () => {
  it("finds the eight signals a real security page publishes", () => {
    expect(found([VERCEL_SECURITY])).toEqual([
      "bug_bounty",
      "dpa",
      "gdpr",
      "iso27001",
      "pci_dss",
      "soc2",
      "subprocessors",
      "vuln_disclosure",
    ]);
  });

  it("finds nothing on a real pricing page, which is what makes the score discriminate", () => {
    expect(found([STRIPE_PRICING])).toEqual([]);
  });

  it("finds the compliance signals a real trust hub lists", () => {
    expect(found([CLOUDFLARE_TRUST])).toEqual(["gdpr", "iso27001", "pci_dss", "soc2"]);
  });

  it("finds the data protection signals a real privacy page lists", () => {
    expect(found([STRIPE_PRIVACY])).toEqual(["dpa", "gdpr", "subprocessors"]);
  });

  it("unions signals across pages, as a scan of several trust surfaces does", () => {
    const union = found([STRIPE_PRICING, STRIPE_PRIVACY, VERCEL_SECURITY]);
    expect(union).toContain("bug_bounty");
    expect(union).toContain("subprocessors");
    expect(union.length).toBeGreaterThan(found([STRIPE_PRIVACY]).length);
  });
});

describe("detectSignals evidence", () => {
  it("attaches the source url and a bounded excerpt", () => {
    const soc2 = detectSignals([VERCEL_SECURITY]).find((r) => r.id === "soc2");
    expect(soc2?.evidence?.url).toContain("vercel.com/security");
    expect(soc2?.evidence?.excerpt).toMatch(/SOC 2/i);
    expect(soc2?.evidence?.excerpt?.length).toBeLessThanOrEqual(200);
  });

  it("cites the page a signal was actually found on, not the first page searched", () => {
    const bounty = detectSignals([STRIPE_PRICING, VERCEL_SECURITY]).find((r) => r.id === "bug_bounty");
    expect(bounty?.evidence?.url).toContain("vercel.com/security");
  });

  it("carries no evidence for a signal that was not found", () => {
    const missing = detectSignals([STRIPE_PRICING]).find((r) => r.id === "soc2");
    expect(missing?.evidence).toBeUndefined();
  });
});

describe("detectSignals guards against the false positives that would inflate a score", () => {
  it("does not read the marketing word trusted as a trust signal", () => {
    expect(found([{ url: "x", text: "Trusted by millions of teams worldwide." }])).toEqual([]);
  });

  it("does not match a lowercase dpa inside another word", () => {
    expect(found([{ url: "x", text: "See our updpated terms." }])).toEqual([]);
  });

  it("does not match soc2 inside an unrelated token", () => {
    expect(found([{ url: "x", text: "The ASOC2000 sensor array." }])).toEqual([]);
  });
});

describe("detectSignals treats a page's own address as evidence", () => {
  // A live scan loaded https://status.vercel.com/ successfully and still
  // reported no status page: innerText reads "Vercel Status" and never contains
  // the address. Loading the page is the evidence, so the URL is searched too.
  it("finds a status page from the address when the text does not say so", () => {
    const results = detectSignals([
      { url: "https://status.vercel.com/", text: "Vercel Status All Systems Operational" },
    ]);
    const status = results.find((r) => r.id === "status_page");
    expect(status?.found).toBe(true);
    expect(status?.evidence?.url).toBe("https://status.vercel.com/");
  });

  it("finds a security contact from a security.txt address", () => {
    const results = detectSignals([
      { url: "https://acme.com/.well-known/security.txt", text: "Contact: mailto:security@acme.com" },
    ]);
    expect(results.find((r) => r.id === "vuln_disclosure")?.found).toBe(true);
    expect(results.find((r) => r.id === "security_contact")?.found).toBe(true);
  });

  it("does not let an ordinary page address invent signals", () => {
    const results = detectSignals([{ url: "https://acme.com/pricing", text: "Plans and pricing." }]);
    expect(results.every((r) => !r.found)).toBe(true);
  });
});
