import { MAX_CVE_LOOKUPS, NVD_SPACING_MS, userAgent } from "@/lib/config";
import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { HeadersResult, ObservedSoftware, TechResult } from "@/lib/types";

/**
 * Only products with a confident vendor and product pair are mapped. An
 * unmapped product is reported as observed with its CVE lookup skipped, which
 * is honest, rather than guessed at a CPE and reported with someone else's CVEs.
 */
export const CPE_MAP: Record<string, string> = {
  nginx: "cpe:2.3:a:nginx:nginx",
  apache: "cpe:2.3:a:apache:http_server",
  openssl: "cpe:2.3:a:openssl:openssl",
  php: "cpe:2.3:a:php:php",
  wordpress: "cpe:2.3:a:wordpress:wordpress",
  express: "cpe:2.3:a:expressjs:express",
  iis: "cpe:2.3:a:microsoft:internet_information_services",
  drupal: "cpe:2.3:a:drupal:drupal",
  tomcat: "cpe:2.3:a:apache:tomcat",
};

const PRODUCT_ALIASES: Record<string, string> = {
  "apache httpd": "apache",
  "microsoft-iis": "iis",
};

function normalizeProduct(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  return PRODUCT_ALIASES[lowered] ?? lowered;
}

function observe(raw: string, source: string): ObservedSoftware | null {
  // Servers append a platform comment and sometimes a second product after the
  // version. The leading token is the observation; the slice bounds the work a
  // hostile header can ask of the matcher.
  const head = raw.trim().slice(0, 200).split(/\s+\(/)[0] ?? "";
  const match = /^([a-z][a-z0-9 _.+-]*?)(?:\/|\s+)?v?(\d+(?:\.\d+)+)?$/i.exec(head.trim());
  if (!match?.[1]) return null;
  const product = normalizeProduct(match[1]);
  const version = match[2];
  const cpe = CPE_MAP[product];
  const cveLookup: ObservedSoftware["cveLookup"] = !version
    ? "skipped_no_version"
    : !cpe
      ? "skipped_no_cpe"
      : "performed";
  return { product, version, source, cpe: version && cpe ? `${cpe}:${version}` : cpe, cveLookup, cves: [] };
}

export function fingerprint(headers: HeadersResult, html: string): ObservedSoftware[] {
  const observed: ObservedSoftware[] = [];
  const server = headers.headers["server"];
  if (server) {
    const entry = observe(server, "server header");
    if (entry) observed.push(entry);
  }
  const poweredBy = headers.headers["x-powered-by"];
  if (poweredBy) {
    const entry = observe(poweredBy, "x-powered-by header");
    if (entry) observed.push(entry);
  }
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (generator) {
    const entry = observe(generator, "generator meta tag");
    if (entry) observed.push(entry);
  }
  return observed;
}

/**
 * NVD allows five requests per thirty seconds without an API key, so the
 * lookups are both capped and spaced.
 */
export const NVD_SCRIPT = `
set -u
UA="$1"
shift
for CPE in "$@"; do
  echo "=== $CPE ==="
  curl -sS --max-time 25 -A "$UA" \\
    "https://services.nvd.nist.gov/rest/json/cves/2.0?virtualMatchString=$CPE&resultsPerPage=20" \\
    || echo '{"vulnerabilities":[]}'
  echo
  sleep ${Math.ceil(NVD_SPACING_MS / 1000)}
done
`;

function cveEntries(value: unknown): ObservedSoftware["cves"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const cve = ((item as { cve?: unknown } | null)?.cve ?? {}) as Record<string, unknown>;
    const metric = (cve.metrics as { cvssMetricV31?: unknown[] } | undefined)?.cvssMetricV31?.[0] as
      | { cvssData?: { baseScore?: number }; baseSeverity?: string }
      | undefined;
    return {
      id: typeof cve.id === "string" ? cve.id : "unknown",
      cvss: metric?.cvssData?.baseScore,
      severity: metric?.baseSeverity,
      published: typeof cve.published === "string" ? cve.published : undefined,
    };
  });
}

export function parseNvd(stdout: string): Map<string, ObservedSoftware["cves"]> {
  const byCpe = new Map<string, ObservedSoftware["cves"]>();
  const pattern = /=== (\S+) ===\r?\n([\s\S]*?)(?=\r?\n=== |$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stdout)) !== null) {
    const [, cpe = "", body = ""] = match;
    try {
      const parsed = JSON.parse(body.trim()) as { vulnerabilities?: unknown };
      byCpe.set(cpe, cveEntries(parsed?.vulnerabilities));
    } catch {
      byCpe.set(cpe, []);
    }
  }
  return byCpe;
}

export async function checkTech(
  runner: SandboxRunner,
  headers: HeadersResult,
  domain: string,
): Promise<TechResult> {
  try {
    const body = await runner.run(
      `set -u\ncurl -sS --max-time 20 -A "$2" "https://$1/" | head -c 512000`,
      [domain, userAgent()],
    );
    const software = fingerprint(headers, body.stdout);
    const versionDisclosed = software.some((entry) => Boolean(entry.version));

    const lookups = software.filter((entry) => entry.cveLookup === "performed").slice(0, MAX_CVE_LOOKUPS);
    for (const entry of software) {
      if (entry.cveLookup === "performed" && !lookups.includes(entry)) {
        entry.cveLookup = "unavailable";
      }
    }

    if (lookups.length > 0) {
      const cpes = lookups.map((entry) => entry.cpe).filter((cpe): cpe is string => Boolean(cpe));
      const nvd = await runner.run(NVD_SCRIPT, [userAgent(), ...cpes], 40_000 + cpes.length * NVD_SPACING_MS);
      const byCpe = parseNvd(nvd.stdout);
      for (const entry of lookups) {
        entry.cves = (entry.cpe && byCpe.get(entry.cpe)) || [];
        if (entry.cpe && !byCpe.has(entry.cpe)) entry.cveLookup = "unavailable";
      }
    }

    return { status: "info", software, versionDisclosed };
  } catch (error) {
    return {
      status: "unavailable",
      software: [],
      versionDisclosed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
