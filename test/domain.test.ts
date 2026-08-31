import { describe, it, expect } from "vitest";
import { normalizeDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it.each([
    ["ACME.com", "acme.com"],
    ["https://acme.com/security", "acme.com"],
    ["http://www.acme.com:8443/a/b?c=d", "www.acme.com"],
    ["  acme.com.  ", "acme.com"],
    ["sub.domain.acme.co.uk", "sub.domain.acme.co.uk"],
    ["a-b.acme.com", "a-b.acme.com"],
    ["a".repeat(63) + ".com", "a".repeat(63) + ".com"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizeDomain(input)).toEqual({ ok: true, domain: expected });
  });

  it.each([
    "",
    "localhost",
    "acme",
    "192.168.1.1",
    "127.0.0.1",
    "8.8.8.8",
    "10.0.0.5",
    "printer.local",
    "thing.internal",
    "user:pass@acme.com",
    "acme..com",
    "-acme.com",
    "acme-.com",
    "acme.c",
    "acme.123",
    "not a domain",
    "a".repeat(64) + ".com",
  ])("rejects %s", (input) => {
    expect(normalizeDomain(input).ok).toBe(false);
  });

  it("gives a reason on rejection", () => {
    const result = normalizeDomain("127.0.0.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("names the address when refusing an IP", () => {
    const result = normalizeDomain("8.8.8.8");
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toMatch(/IP address/i);
  });

  it("names the offending label when refusing a hyphen edge", () => {
    const result = normalizeDomain("-acme.com");
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toMatch(/-acme/);
  });
});

describe("normalizeDomain scheme independence", () => {
  // The bug this pins: routing schemed input through new URL punycoded it and
  // dropped its query string while bare input got neither, so the same domain
  // reached two different verdicts depending on whether the user typed https://.
  it.each([
    "munchen.de",
    "xn--mnchen-3ya.de",
    "acme.com",
    "acme.com?x=1",
    "acme.com#fragment",
    "acme.com/path",
    "über.de",
    "acme.123",
    "192.168.1.1",
  ])("reaches the same verdict for %s with and without a scheme", (bare) => {
    const withScheme = normalizeDomain(`https://${bare}`);
    const withoutScheme = normalizeDomain(bare);
    expect(withScheme).toEqual(withoutScheme);
  });

  it("refuses an international domain rather than silently punycoding it", () => {
    const result = normalizeDomain("https://münchen.de");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("punycode");
  });

  it("accepts the punycode form that the refusal points at", () => {
    expect(normalizeDomain("xn--mnchen-3ya.de")).toEqual({
      ok: true,
      domain: "xn--mnchen-3ya.de",
    });
  });

  it("strips a query or fragment whether or not a scheme is present", () => {
    for (const input of ["acme.com?x=1", "https://acme.com?x=1", "acme.com#f", "https://acme.com#f"]) {
      expect(normalizeDomain(input)).toEqual({ ok: true, domain: "acme.com" });
    }
  });

  it("strips any scheme, not only http and https", () => {
    expect(normalizeDomain("ftp://acme.com")).toEqual({ ok: true, domain: "acme.com" });
  });

  it("refuses an IPv6 literal", () => {
    expect(normalizeDomain("http://[::1]/").ok).toBe(false);
  });
});

describe("normalizeDomain boundaries", () => {
  it("accepts a 63 character label and refuses a 64 character label", () => {
    expect(normalizeDomain("a".repeat(63) + ".com").ok).toBe(true);
    expect(normalizeDomain("a".repeat(64) + ".com").ok).toBe(false);
  });

  it("accepts a host at 253 characters and refuses one longer", () => {
    // 63 + 1 + 63 + 1 + 63 + 1 + 57 + 4 (".com") lands exactly on 253.
    const at253 = [ "a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(57) ].join(".") + ".com";
    expect(at253.length).toBe(253);
    expect(normalizeDomain(at253).ok).toBe(true);
    expect(normalizeDomain("e" + at253).ok).toBe(false);
  });
});
