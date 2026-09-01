import { describe, it, expect } from "vitest";
import { buildDohScript, parseDohSections, txtStrings } from "@/lib/engine-b/doh";

const STDOUT = `=== acme.com TXT ===
{"Status":0,"AD":true,"Answer":[{"name":"acme.com","type":16,"data":"\\"v=spf1 include:_spf.google.com ~all\\""}]}
=== _dmarc.acme.com TXT ===
{"Status":0,"AD":false,"Answer":[{"name":"_dmarc.acme.com","type":16,"data":"\\"v=DMARC1; p=reject; rua=mailto:d@acme.com\\""}]}
=== selector1._domainkey.acme.com TXT ===
{"Status":3,"AD":false}
`;

describe("buildDohScript", () => {
  it("emits one backslash for the shell line continuation", () => {
    expect(buildDohScript()).toContain("'accept: application/dns-json' \\\n");
  });

  it("interpolates no query values into the script body", () => {
    expect(buildDohScript()).not.toContain("acme.com");
  });
});

describe("parseDohSections", () => {
  const sections = parseDohSections(STDOUT);

  it("splits one section per query", () => {
    expect(sections.map((s) => s.name)).toEqual([
      "acme.com",
      "_dmarc.acme.com",
      "selector1._domainkey.acme.com",
    ]);
  });

  it("carries the resolver status and the authenticated data flag", () => {
    expect(sections[0]?.status).toBe(0);
    expect(sections[0]?.authenticatedData).toBe(true);
    expect(sections[2]?.status).toBe(3);
  });

  it("unquotes and joins TXT strings", () => {
    expect(txtStrings(sections[0])).toEqual(["v=spf1 include:_spf.google.com ~all"]);
  });

  it("returns an empty list for a section with no answers", () => {
    expect(txtStrings(sections[2])).toEqual([]);
  });

  it("survives malformed JSON without throwing", () => {
    const sections = parseDohSections("=== a.com TXT ===\nnot json\n");
    expect(sections[0]?.status).toBe(-1);
    expect(sections[0]?.answers).toEqual([]);
  });

  it("survives a truncated or empty transcript", () => {
    expect(parseDohSections("")).toEqual([]);
    expect(parseDohSections("=== a.com TXT ===\n")[0]?.status).toBe(-1);
  });

  it("splits a transcript with CRLF line endings", () => {
    const sections = parseDohSections(STDOUT.replace(/\n/g, "\r\n"));
    expect(sections).toHaveLength(3);
    expect(txtStrings(sections[0])).toEqual(["v=spf1 include:_spf.google.com ~all"]);
  });
});
