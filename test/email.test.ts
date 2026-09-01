import { describe, it, expect } from "vitest";
import { parseEmailAuth, emailQueries, DKIM_SELECTORS } from "@/lib/engine-b/email";
import { parseDohSections } from "@/lib/engine-b/doh";
import { MAX_DKIM_SELECTORS } from "@/lib/config";

const STDOUT = `=== acme.com TXT ===
{"Status":0,"AD":true,"Answer":[{"name":"acme.com","type":16,"data":"\\"v=spf1 include:_spf.google.com -all\\""}]}
=== _dmarc.acme.com TXT ===
{"Status":0,"AD":true,"Answer":[{"name":"_dmarc.acme.com","type":16,"data":"\\"v=DMARC1; p=quarantine; pct=100\\""}]}
=== selector1._domainkey.acme.com TXT ===
{"Status":0,"AD":true,"Answer":[{"name":"selector1._domainkey.acme.com","type":16,"data":"\\"v=DKIM1; k=rsa; p=MIGf\\""}]}
=== selector2._domainkey.acme.com TXT ===
{"Status":3,"AD":false}
`;

describe("emailQueries", () => {
  it("never exceeds the DKIM selector cap", () => {
    expect(DKIM_SELECTORS.length).toBeLessThanOrEqual(MAX_DKIM_SELECTORS);
    expect(emailQueries("acme.com")).toHaveLength(2 + DKIM_SELECTORS.length);
  });

  it("asks for SPF at the root and DMARC at _dmarc", () => {
    const queries = emailQueries("acme.com");
    expect(queries[0]).toEqual({ name: "acme.com", type: "TXT" });
    expect(queries[1]).toEqual({ name: "_dmarc.acme.com", type: "TXT" });
  });
});

describe("parseEmailAuth", () => {
  const result = parseEmailAuth(parseDohSections(STDOUT), "acme.com");

  it("finds SPF and its all qualifier", () => {
    expect(result.spf.present).toBe(true);
    expect(result.spf.allQualifier).toBe("-all");
  });

  it("finds DMARC and reads its policy", () => {
    expect(result.dmarc.present).toBe(true);
    expect(result.dmarc.policy).toBe("quarantine");
  });

  it("lists only the selectors that answered", () => {
    expect(result.dkim.found).toEqual(["selector1"]);
  });

  it("separates a selector that answered with nothing from a lookup that failed", () => {
    expect(result.status).toBe("info");
    expect(result.dkim.selectorsTried).toEqual(DKIM_SELECTORS);
  });

  it("does not treat a non SPF TXT record as SPF", () => {
    const other = `=== acme.com TXT ===
{"Status":0,"AD":true,"Answer":[{"name":"acme.com","type":16,"data":"\\"google-site-verification=abc\\""}]}
`;
    expect(parseEmailAuth(parseDohSections(other), "acme.com").spf.present).toBe(false);
  });

  it("reports unavailable when every lookup failed", () => {
    const failed = `=== acme.com TXT ===
{"Status":-1}
`;
    expect(parseEmailAuth(parseDohSections(failed), "acme.com").status).toBe("unavailable");
  });

  it("reports unavailable rather than absence when no sections were parsed", () => {
    const empty = parseEmailAuth([], "acme.com");
    expect(empty.status).toBe("unavailable");
    expect(empty.dkim.found).toEqual([]);
  });
});
