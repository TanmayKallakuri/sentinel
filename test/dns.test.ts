import { describe, it, expect } from "vitest";
import { parseDnsHygiene, dnsQueries } from "@/lib/engine-b/dns";
import { parseDohSections } from "@/lib/engine-b/doh";

const STDOUT = `=== acme.com CAA ===
{"Status":0,"AD":true,"Answer":[{"name":"acme.com","type":257,"data":"0 issue \\"letsencrypt.org\\""}]}
=== acme.com DS ===
{"Status":0,"AD":true,"Answer":[{"name":"acme.com","type":43,"data":"12345 13 2 ABCD"}]}
`;

describe("dnsQueries", () => {
  it("asks for CAA and DS on the root domain only", () => {
    expect(dnsQueries("acme.com")).toEqual([
      { name: "acme.com", type: "CAA" },
      { name: "acme.com", type: "DS" },
    ]);
  });
});

describe("parseDnsHygiene", () => {
  const result = parseDnsHygiene(parseDohSections(STDOUT), "acme.com");

  it("records CAA presence and the raw record text", () => {
    expect(result.caa.present).toBe(true);
    expect(result.caa.records[0]).toContain("letsencrypt.org");
  });

  it("records DNSSEC from a DS record and the resolver AD flag", () => {
    expect(result.dnssec.present).toBe(true);
    expect(result.dnssec.dsRecords).toBe(1);
    expect(result.dnssec.authenticatedData).toBe(true);
  });

  it("reports absence, not failure, when the resolver answers with no records", () => {
    const empty = `=== acme.com CAA ===
{"Status":0,"AD":false}
=== acme.com DS ===
{"Status":0,"AD":false}
`;
    const parsed = parseDnsHygiene(parseDohSections(empty), "acme.com");
    expect(parsed.status).toBe("info");
    expect(parsed.caa.present).toBe(false);
    expect(parsed.dnssec.present).toBe(false);
  });

  it("reports unavailable when every lookup failed", () => {
    const failed = `=== acme.com CAA ===
{"Status":-1}
=== acme.com DS ===
{"Status":-1}
`;
    expect(parseDnsHygiene(parseDohSections(failed), "acme.com").status).toBe("unavailable");
  });

  it("reports unavailable when a section is missing entirely", () => {
    const partial = `=== acme.com CAA ===
{"Status":0,"AD":true}
`;
    expect(parseDnsHygiene(parseDohSections(partial), "acme.com").status).toBe("unavailable");
    expect(parseDnsHygiene([], "acme.com").status).toBe("unavailable");
  });
});
