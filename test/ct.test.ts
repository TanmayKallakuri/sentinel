import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CT_SCRIPT, parseCt } from "@/lib/engine-b/ct";
import { CHECK_TIMEOUT_MS, MAX_CT_SUBDOMAINS_SHOWN } from "@/lib/config";

const STDOUT = `SOURCE crt.sh\n${JSON.stringify([
  { name_value: "acme.com\nwww.acme.com" },
  { name_value: "*.api.acme.com" },
  { name_value: "mail.acme.com" },
  { name_value: "www.acme.com" },
  { name_value: "notacme.com" },
])}`;

// The capture is the raw body behind the marker CT_SCRIPT prints, so the parser
// is fed exactly what the sandbox hands it.
function certSpotterCapture(): string {
  const file = path.join(__dirname, "fixtures", "ct", "certspotter-github.com.txt");
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}

describe("parseCt", () => {
  const result = parseCt(STDOUT, "acme.com");

  it("splits multi valued entries and deduplicates", () => {
    expect(result.sample).toContain("www.acme.com");
    expect(result.sample.filter((n) => n === "www.acme.com")).toHaveLength(1);
  });

  it("strips wildcard prefixes", () => {
    expect(result.sample).toContain("api.acme.com");
    expect(result.sample.some((n) => n.startsWith("*."))).toBe(false);
  });

  it("keeps only names under the target domain", () => {
    expect(result.sample).not.toContain("notacme.com");
  });

  it("reports the full total and a capped sample", () => {
    expect(result.total).toBe(result.sample.length);
    expect(result.sample.length).toBeLessThanOrEqual(MAX_CT_SUBDOMAINS_SHOWN);
  });

  it("caps the sample while still counting every name", () => {
    const many = `SOURCE crt.sh\n${JSON.stringify(
      Array.from({ length: MAX_CT_SUBDOMAINS_SHOWN + 10 }, (_, i) => ({ name_value: `h${i}.acme.com` })),
    )}`;
    const capped = parseCt(many, "acme.com");
    expect(capped.total).toBe(MAX_CT_SUBDOMAINS_SHOWN + 10);
    expect(capped.sample).toHaveLength(MAX_CT_SUBDOMAINS_SHOWN);
  });

  it("ignores entries whose name_value is missing or not a string", () => {
    const ragged = `SOURCE crt.sh\n${JSON.stringify([{}, { name_value: null }, { name_value: 7 }, { name_value: "ok.acme.com" }])}`;
    expect(parseCt(ragged, "acme.com").sample).toEqual(["ok.acme.com"]);
  });

  it("reports an empty but successful result for an empty json array", () => {
    const empty = parseCt("SOURCE crt.sh\n[]", "acme.com");
    expect(empty.status).toBe("info");
    expect(empty.total).toBe(0);
  });
});

describe("parseCt source attribution", () => {
  it("records the source named by the marker, not the shape of the body", () => {
    expect(parseCt(STDOUT, "acme.com").source).toBe("crt.sh");
    const spotterShapeUnderCrtshMarker = `SOURCE crt.sh\n${JSON.stringify([{ dns_names: ["a.acme.com"] }])}`;
    expect(parseCt(spotterShapeUnderCrtshMarker, "acme.com").source).toBe("crt.sh");
    expect(parseCt(spotterShapeUnderCrtshMarker, "acme.com").sample).toEqual(["a.acme.com"]);
  });

  it("falls back to the primary source when no marker is present", () => {
    const bare = JSON.stringify([{ name_value: "a.acme.com" }]);
    expect(parseCt(bare, "acme.com").source).toBe("crt.sh");
    expect(parseCt(bare, "acme.com").total).toBe(1);
  });

  it("names both sources when neither answered", () => {
    const both = parseCt("SOURCE none\n", "acme.com");
    expect(both.status).toBe("unavailable");
    expect(both.error).toContain("crt.sh");
    expect(both.error).toContain("Cert Spotter");
  });

  it("names only the source that answered when its body was not usable", () => {
    const crtsh = parseCt("SOURCE crt.sh\n<html>502 Bad Gateway</html>", "acme.com");
    expect(crtsh.status).toBe("unavailable");
    expect(crtsh.source).toBe("crt.sh");
    expect(crtsh.error).not.toContain("Cert Spotter");
    const spotter = parseCt("SOURCE certspotter\nrate limited", "acme.com");
    expect(spotter.source).toBe("certspotter");
    expect(spotter.error).toContain("Cert Spotter");
  });

  it("reports unavailable rather than empty when the whole lookup returns nothing usable", () => {
    expect(parseCt("<html>502 Bad Gateway</html>", "acme.com").status).toBe("unavailable");
    expect(parseCt("", "acme.com").status).toBe("unavailable");
    expect(parseCt("", "acme.com").error).toContain("Cert Spotter");
  });
});

describe("parseCt on a real Cert Spotter response", () => {
  const result = parseCt(certSpotterCapture(), "github.com");

  it("records Cert Spotter as the source that answered", () => {
    expect(result.source).toBe("certspotter");
    expect(result.status).toBe("info");
  });

  it("reads the dns_names array shape", () => {
    expect(result.sample).toContain("api.mcp.github.com");
    expect(result.sample).toContain("classroom.github.com");
  });

  it("strips wildcards and deduplicates against the bare name on the same certificate", () => {
    expect(result.sample.some((n) => n.startsWith("*."))).toBe(false);
    expect(result.sample.filter((n) => n === "examadmin-uat.github.com")).toHaveLength(1);
  });

  it("drops the other registrable domains the same certificates carry", () => {
    expect(result.sample).not.toContain("github.io");
    expect(result.sample).not.toContain("githubusercontent.com");
    expect(result.sample).not.toContain("smtp.ghe.com");
  });

  it("counts every deduplicated name and sorts the sample", () => {
    expect(result.total).toBe(43);
    expect(result.sample).toHaveLength(Math.min(result.total, MAX_CT_SUBDOMAINS_SHOWN));
    expect([...result.sample].sort()).toEqual(result.sample);
  });

  it("never throws on ragged Cert Spotter entries", () => {
    const ragged = `SOURCE certspotter\n${JSON.stringify([
      null, 7, "text", { dns_names: null }, { dns_names: "a.acme.com" }, { dns_names: [7, null, "ok.acme.com"] },
    ])}`;
    const parsed = parseCt(ragged, "acme.com");
    expect(parsed.sample).toEqual(["ok.acme.com"]);
    expect(parsed.source).toBe("certspotter");
  });
});

describe("CT_SCRIPT", () => {
  it("marks every exit with the source that produced the body", () => {
    expect(CT_SCRIPT).toContain("SOURCE crt.sh");
    expect(CT_SCRIPT).toContain("SOURCE certspotter");
    expect(CT_SCRIPT).toContain("SOURCE none");
  });

  it("tries Cert Spotter exactly once, after the three crt.sh attempts", () => {
    expect(CT_SCRIPT).toContain("for delay in 0 2 4");
    expect([...CT_SCRIPT.matchAll(/api\.certspotter\.com/g)]).toHaveLength(1);
    expect(CT_SCRIPT.indexOf("certspotter")).toBeGreaterThan(CT_SCRIPT.indexOf("crt.sh"));
  });

  it("keeps the retries plus the fallback inside the per check timeout", () => {
    const budgets = [...CT_SCRIPT.matchAll(/--max-time (\d+)/g)].map((m) => Number(m[1]));
    expect(budgets).toHaveLength(2);
    const [perAttempt = 0, fallback = 0] = budgets;
    const backoffSeconds = 2 + 4;
    expect(perAttempt * 3 + backoffSeconds + fallback).toBeLessThanOrEqual(CHECK_TIMEOUT_MS / 1000);
  });

  it("passes the domain as an argument rather than interpolating it", () => {
    expect(CT_SCRIPT).toContain('D="$1"');
    expect(CT_SCRIPT).toContain("domain=$D");
  });
});
