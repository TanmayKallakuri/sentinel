import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isSameSite } from "@/lib/engine-a/targets";
import { detectSignals } from "@/lib/engine-a/signals";

// Real 301 chains captured with curl from live status pages. The same site
// check runs on the link href before navigation, but goto follows redirects, so
// it has to run again on the landed URL. These are the actual hops, not invented
// ones: a trust surface redirecting to another registrable domain is common.
function chains(): { requested: string; landed: string }[] {
  const file = path.join(__dirname, "fixtures", "redirects", "offsite-status-pages.txt");
  const text = readFileSync(file, "utf8");
  const out: { requested: string; landed: string }[] = [];
  let requested = "";
  for (const line of text.split(/\r?\n/)) {
    const req = /^REQUESTED (\S+)/.exec(line);
    if (req?.[1]) requested = req[1];
    const landed = /^LANDED (\S+)/.exec(line);
    if (landed?.[1] && requested) out.push({ requested, landed: landed[1] });
  }
  return out;
}

const CHAINS = chains();

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function registrableOf(url: string): string {
  const parts = hostOf(url).split(".");
  return parts.slice(-2).join(".");
}

describe("captured off-site redirect chains", () => {
  it("captured at least four real chains", () => {
    expect(CHAINS.length).toBeGreaterThanOrEqual(4);
  });

  it.each(CHAINS)("$requested lands on a different registrable domain", ({ requested, landed }) => {
    expect(registrableOf(landed)).not.toBe(registrableOf(requested));
  });

  it.each(CHAINS)(
    "$requested passes the pre navigation check but fails it on the landed URL",
    ({ requested, landed }) => {
      const target = registrableOf(requested);
      // The requested host is in scope, which is why the link was followed.
      expect(isSameSite(hostOf(requested), target)).toBe(true);
      // Where it landed is not, which is what the second check catches.
      expect(isSameSite(hostOf(landed), target)).toBe(false);
    },
  );

  it("would have been read as the vendor's own page without the landed check", () => {
    const github = CHAINS.find((c) => c.requested.includes("github.com"));
    expect(github?.landed).toContain("githubstatus.com");
    expect(isSameSite(hostOf(github!.landed), "github.com")).toBe(false);
  });
});

describe("the status page signal is satisfied by the redirect itself", () => {
  // The vendor controls the DNS and the redirect on their own domain, so
  // status.<vendor>.com existing and redirecting is the evidence. Every other
  // signal is a claim about content and stays unverified when it is only
  // reachable through an off-site redirect.
  const GITHUB = CHAINS.find((c) => c.requested.includes("status.github.com"))!;

  it("counts a status subdomain that redirects off-site as found", () => {
    const results = detectSignals([], [{ url: GITHUB.requested, redirectedTo: hostOf(GITHUB.landed) }]);
    const status = results.find((r) => r.id === "status_page");
    expect(status?.found).toBe(true);
    expect(status?.evidence?.url).toBe(GITHUB.requested);
    expect(status?.evidence?.raw).toContain("githubstatus.com");
  });

  it("shows the destination host in the evidence", () => {
    const results = detectSignals([], [{ url: GITHUB.requested, redirectedTo: "www.githubstatus.com" }]);
    expect(results.find((r) => r.id === "status_page")?.evidence?.raw).toContain(
      "redirected off-site to www.githubstatus.com",
    );
  });

  it("does not let an off-site redirect satisfy any content derived signal", () => {
    const results = detectSignals(
      [],
      [{ url: "https://acme.com/security", redirectedTo: "acme.trustportal.example" }],
    );
    expect(results.filter((r) => r.found)).toEqual([]);
  });

  it("does not treat a non status surface redirect as a status page", () => {
    const results = detectSignals([], [{ url: "https://acme.com/legal", redirectedTo: "elsewhere.example" }]);
    expect(results.find((r) => r.id === "status_page")?.found).toBe(false);
  });

  it("prefers real content evidence over the redirect when both exist", () => {
    const results = detectSignals(
      [{ url: "https://acme.com/", text: "Visit our status page for uptime." }],
      [{ url: "https://status.acme.com/", redirectedTo: "acme.statuspage.io" }],
    );
    const status = results.find((r) => r.id === "status_page");
    expect(status?.found).toBe(true);
    expect(status?.evidence?.url).toBe("https://acme.com/");
  });
});
