import { describe, it, expect } from "vitest";
import { fingerprint, parseNvd, CPE_MAP, NVD_SCRIPT } from "@/lib/engine-b/tech";
import { MAX_CVE_LOOKUPS, NVD_SPACING_MS } from "@/lib/config";
import type { HeadersResult } from "@/lib/types";

describe("NVD_SCRIPT", () => {
  it("emits one backslash per shell line continuation", () => {
    expect(NVD_SCRIPT).toContain('-A "$UA" \\\n');
    expect(NVD_SCRIPT).not.toContain("\\\\");
  });

  it("spaces the lookups by the configured interval", () => {
    expect(NVD_SCRIPT).toContain(`sleep ${Math.ceil(NVD_SPACING_MS / 1000)}`);
    expect(MAX_CVE_LOOKUPS).toBeLessThanOrEqual(5);
  });
});

function headersWith(values: Record<string, string>): HeadersResult {
  return { status: "info", httpStatus: 200, headers: { ...values } };
}

describe("fingerprint", () => {
  it("extracts product and version from the Server header", () => {
    const software = fingerprint(headersWith({ server: "nginx/1.24.0" }), "");
    expect(software[0]).toMatchObject({ product: "nginx", version: "1.24.0", source: "server header" });
    expect(software[0]?.cpe).toBe(`${CPE_MAP["nginx"]}:1.24.0`);
  });

  it("extracts from X-Powered-By", () => {
    const software = fingerprint(headersWith({ "x-powered-by": "PHP/8.1.2" }), "");
    expect(software[0]).toMatchObject({ product: "php", version: "8.1.2" });
  });

  it("records a product with no version and skips its CVE lookup", () => {
    const software = fingerprint(headersWith({ server: "cloudflare" }), "");
    expect(software[0]).toMatchObject({ product: "cloudflare", version: undefined, cveLookup: "skipped_no_version" });
  });

  it("marks a versioned product with no CPE mapping as skipped", () => {
    const software = fingerprint(headersWith({ server: "acmeserver/2.0" }), "");
    expect(software[0]?.cveLookup).toBe("skipped_no_cpe");
  });

  it("reads a generator meta tag from the page html", () => {
    const html = '<meta name="generator" content="WordPress 6.4.2" />';
    const software = fingerprint(headersWith({}), html);
    expect(software.some((s) => s.product === "wordpress" && s.version === "6.4.2")).toBe(true);
  });

  it("reads past the platform comment servers append to the version", () => {
    const software = fingerprint(headersWith({ server: "Apache/2.4.41 (Ubuntu)" }), "");
    expect(software[0]).toMatchObject({ product: "apache", version: "2.4.41" });
  });

  it("returns nothing when no software is disclosed", () => {
    expect(fingerprint(headersWith({}), "<html></html>")).toEqual([]);
  });

  it("does not throw on an unavailable headers result or a very long header", () => {
    const unavailable: HeadersResult = { status: "unavailable", headers: { server: null }, error: "x" };
    expect(fingerprint(unavailable, "")).toEqual([]);
    expect(() => fingerprint(headersWith({ server: "a".repeat(100_000) }), "")).not.toThrow();
  });
});

describe("parseNvd", () => {
  const STDOUT = `=== cpe:2.3:a:nginx:nginx:1.24.0 ===
{"vulnerabilities":[{"cve":{"id":"CVE-2024-0001","published":"2024-01-01T00:00:00.000","metrics":{"cvssMetricV31":[{"cvssData":{"baseScore":7.5},"baseSeverity":"HIGH"}]}}}]}
`;

  it("maps each cpe to its associated CVEs", () => {
    const byCpe = parseNvd(STDOUT);
    const cves = byCpe.get("cpe:2.3:a:nginx:nginx:1.24.0");
    expect(cves?.[0]).toMatchObject({ id: "CVE-2024-0001", cvss: 7.5, severity: "HIGH" });
  });

  it("returns an empty list for a section that failed to parse", () => {
    expect(parseNvd("=== x ===\nnot json\n").get("x")).toEqual([]);
  });

  it("keeps a CVE that carries no v3.1 metric", () => {
    const stdout = `=== x ===
{"vulnerabilities":[{"cve":{"id":"CVE-2024-0002"}}]}
`;
    expect(parseNvd(stdout).get("x")).toEqual([
      { id: "CVE-2024-0002", cvss: undefined, severity: undefined, published: undefined },
    ]);
  });

  it("returns an empty map for empty output", () => {
    expect(parseNvd("").size).toBe(0);
  });
});
