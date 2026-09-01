import { describe, it, expect } from "vitest";
import { parseCt } from "@/lib/engine-b/ct";
import { MAX_CT_SUBDOMAINS_SHOWN } from "@/lib/config";

const STDOUT = JSON.stringify([
  { name_value: "acme.com\nwww.acme.com" },
  { name_value: "*.api.acme.com" },
  { name_value: "mail.acme.com" },
  { name_value: "www.acme.com" },
  { name_value: "notacme.com" },
]);

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
    const many = JSON.stringify(
      Array.from({ length: MAX_CT_SUBDOMAINS_SHOWN + 10 }, (_, i) => ({ name_value: `h${i}.acme.com` })),
    );
    const capped = parseCt(many, "acme.com");
    expect(capped.total).toBe(MAX_CT_SUBDOMAINS_SHOWN + 10);
    expect(capped.sample).toHaveLength(MAX_CT_SUBDOMAINS_SHOWN);
  });

  it("ignores entries whose name_value is missing or not a string", () => {
    const ragged = JSON.stringify([{}, { name_value: null }, { name_value: 7 }, { name_value: "ok.acme.com" }]);
    expect(parseCt(ragged, "acme.com").sample).toEqual(["ok.acme.com"]);
  });

  it("reports unavailable rather than empty when crt.sh returns nothing usable", () => {
    expect(parseCt("<html>502 Bad Gateway</html>", "acme.com").status).toBe("unavailable");
    expect(parseCt("", "acme.com").status).toBe("unavailable");
  });

  it("reports an empty but successful result for an empty json array", () => {
    const empty = parseCt("[]", "acme.com");
    expect(empty.status).toBe("info");
    expect(empty.total).toBe(0);
  });
});
