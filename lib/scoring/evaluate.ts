import type {
  CategoryId,
  CategoryScore,
  EngineAResult,
  EngineBResult,
  Finding,
} from "@/lib/types";
import { CATEGORY_LABELS, SIGNAL_POINTS, WEIGHTS } from "./scoring";

function finding(
  id: string,
  label: string,
  earned: number,
  available: number,
  observation: string,
  extra: Partial<Finding> = {},
): Finding {
  return {
    id,
    label,
    status: available === 0 ? "unavailable" : earned === available ? "pass" : earned > 0 ? "warn" : "fail",
    observation,
    pointsEarned: earned,
    pointsAvailable: available,
    ...extra,
  };
}

function toCategory(id: CategoryId, findings: Finding[]): CategoryScore {
  const pointsEarned = findings.reduce((sum, f) => sum + f.pointsEarned, 0);
  const pointsAvailable = findings.reduce((sum, f) => sum + f.pointsAvailable, 0);
  const weight = WEIGHTS[id];
  return {
    id,
    label: CATEGORY_LABELS[id],
    weight,
    pointsEarned,
    pointsAvailable,
    pointsNotAssessed: pointsAvailable === 0 ? weight : 0,
    score: pointsAvailable === 0 ? 0 : (pointsEarned / pointsAvailable) * weight,
    findings,
  };
}

function governance(a: EngineAResult): CategoryScore {
  const signals = a.signals.map((signal) => {
    const points = SIGNAL_POINTS[signal.id];
    return finding(
      `governance.${signal.id}`,
      signal.label,
      signal.found ? points : 0,
      points,
      signal.found
        ? `Found on ${signal.evidence?.url ?? "a public trust page"}.`
        : "No public page referencing this was found at the probed trust surfaces.",
      signal.evidence ? { evidence: signal.evidence } : {},
    );
  });

  // A page that left the scan target was deliberately not read, so it is
  // recorded at zero points rather than counted as an absence of the signal.
  const offsite = a.pages
    .filter((page) => page.status === "redirected_offsite")
    .map((page, index) =>
      finding(
        `governance.offsite.${index + 1}`,
        "Trust surface redirected to another domain",
        0,
        0,
        `${page.url} redirected to ${page.redirectedTo ?? "another host"}, which is outside the scan target, so the page content was not read and no governance signal was credited from it.`,
        { status: "unverified", evidence: { url: page.url } },
      ),
    );

  return toCategory("governance", [...signals, ...offsite]);
}

function transport(b: EngineBResult): CategoryScore {
  const tls = b.tls;
  if (tls.status === "unavailable") {
    return toCategory("transport", [
      finding("transport.unavailable", "TLS handshake", 0, 0, `TLS could not be assessed. ${tls.error ?? ""}`.trim()),
    ]);
  }
  const days = tls.daysToExpiry ?? -1;
  return toCategory("transport", [
    finding("transport.chain", "Certificate chain validates", tls.chainValid ? 6 : 0, 6,
      tls.chainValid ? `Chain validated with verify return code ${tls.verifyMessage}.` : `Chain did not validate: ${tls.verifyMessage ?? "unknown"}.`,
      { evidence: { raw: tls.issuer } }),
    finding("transport.notExpired", "Certificate is within its validity window", days >= 0 ? 5 : 0, 5,
      `Certificate notAfter is ${tls.notAfter ?? "unknown"}, ${days} days from the scan.`),
    finding("transport.renewalHeadroom", "At least 30 days before expiry", days >= 30 ? 3 : 0, 3,
      `${days} days of validity remain.`),
    finding("transport.tls13", "TLS 1.3 negotiated", tls.tls13Supported ? 4 : 0, 4,
      tls.tls13Supported ? "TLS 1.3 handshake succeeded." : "TLS 1.3 handshake did not succeed."),
    finding("transport.tls12", "TLS 1.2 negotiated", tls.tls12Supported ? 2 : 0, 2,
      tls.tls12Supported ? "TLS 1.2 handshake succeeded." : "TLS 1.2 handshake did not succeed."),
    finding("transport.legacy", "Legacy TLS 1.0 and 1.1 support", 0, 0,
      tls.legacyProtocolsTestable
        ? "The scanner's OpenSSL build can test legacy protocols; results are informational only."
        : "The scanner's OpenSSL build cannot negotiate TLS 1.0 or 1.1, so their status was not assessed."),
  ]);
}

function headers(b: EngineBResult): CategoryScore {
  const h = b.headers;
  if (h.status === "unavailable") {
    return toCategory("headers", [
      finding("headers.unavailable", "Security headers", 0, 0, `Headers could not be assessed. ${h.error ?? ""}`.trim()),
    ]);
  }
  const hsts = h.headers["strict-transport-security"];
  const maxAge = hsts ? Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0) : 0;
  const csp = h.headers["content-security-policy"];
  const frameProtected = Boolean(h.headers["x-frame-options"]) || /frame-ancestors/i.test(csp ?? "");

  return toCategory("headers", [
    finding("headers.hsts", "Strict-Transport-Security", maxAge >= 31_536_000 ? 4 : hsts ? 2 : 0, 4,
      hsts ? `Header present with max-age ${maxAge}.` : "Header not present on the root response.",
      { evidence: { raw: hsts ?? undefined } }),
    finding("headers.csp", "Content-Security-Policy", csp ? 4 : 0, 4,
      csp ? "Header present on the root response." : "Header not present on the root response.",
      { evidence: { raw: csp ?? undefined } }),
    finding("headers.frame", "Framing protection", frameProtected ? 2 : 0, 2,
      frameProtected ? "X-Frame-Options or a CSP frame-ancestors directive is present." : "Neither X-Frame-Options nor a CSP frame-ancestors directive was present."),
    finding("headers.nosniff", "X-Content-Type-Options", h.headers["x-content-type-options"] ? 2 : 0, 2,
      h.headers["x-content-type-options"] ? "Header present." : "Header not present."),
    finding("headers.referrer", "Referrer-Policy", h.headers["referrer-policy"] ? 2 : 0, 2,
      h.headers["referrer-policy"] ? "Header present." : "Header not present."),
    finding("headers.permissions", "Permissions-Policy", h.headers["permissions-policy"] ? 1 : 0, 1,
      h.headers["permissions-policy"] ? "Header present." : "Header not present."),
  ]);
}

function email(b: EngineBResult): CategoryScore {
  const e = b.email;
  if (e.status === "unavailable") {
    return toCategory("email", [
      finding("email.unavailable", "Email authentication", 0, 0, `Email authentication could not be assessed. ${e.error ?? ""}`.trim()),
    ]);
  }
  const policyPoints = e.dmarc.policy === "reject" ? 4 : e.dmarc.policy === "quarantine" ? 2 : 0;
  const strictSpf = e.spf.allQualifier === "-all" || e.spf.allQualifier === "~all";

  return toCategory("email", [
    finding("email.spf", "SPF record published", e.spf.present ? 3 : 0, 3,
      e.spf.present ? "An SPF record was published at the root domain." : "No SPF record was published at the root domain.",
      { evidence: { raw: e.spf.record } }),
    finding("email.spfStrict", "SPF ends in a restrictive all qualifier", strictSpf ? 2 : 0, 2,
      e.spf.allQualifier ? `SPF ends in ${e.spf.allQualifier}.` : "No all qualifier was observed in the SPF record."),
    finding("email.dmarc", "DMARC record published", e.dmarc.present ? 3 : 0, 3,
      e.dmarc.present ? "A DMARC record was published at _dmarc." : "No DMARC record was published at _dmarc.",
      { evidence: { raw: e.dmarc.record } }),
    finding("email.dmarcPolicy", "DMARC enforcement policy", policyPoints, 4,
      e.dmarc.policy ? `DMARC policy is p=${e.dmarc.policy}.` : "No DMARC policy was observed."),
    finding("email.dkim", "DKIM selector observed", e.dkim.found.length > 0 ? 3 : 0, 3,
      e.dkim.found.length > 0
        ? `Answered for selector or selectors: ${e.dkim.found.join(", ")}.`
        : `None of the ${e.dkim.selectorsTried.length} common selectors answered. Absence here does not prove DKIM is unconfigured.`),
  ]);
}

function dns(b: EngineBResult): CategoryScore {
  const d = b.dns;
  if (d.status === "unavailable") {
    return toCategory("dns", [
      finding("dns.unavailable", "DNS hygiene", 0, 0, `DNS hygiene could not be assessed. ${d.error ?? ""}`.trim()),
    ]);
  }
  return toCategory("dns", [
    finding("dns.caa", "CAA record published", d.caa.present ? 5 : 0, 5,
      d.caa.present ? `${d.caa.records.length} CAA record or records published.` : "No CAA record was published.",
      { evidence: { raw: d.caa.records.join(" | ") || undefined } }),
    finding("dns.dnssec", "DNSSEC delegation present", d.dnssec.present ? 5 : 0, 5,
      d.dnssec.present
        ? `${d.dnssec.dsRecords} DS record or records published; resolver authenticated data flag is ${d.dnssec.authenticatedData}.`
        : "No DS record was published at the parent zone."),
  ]);
}

function cve(b: EngineBResult): CategoryScore {
  const t = b.tech;
  if (t.status === "unavailable") {
    return toCategory("cve", [
      finding("cve.unavailable", "Observed software", 0, 0, `Software observation could not be completed. ${t.error ?? ""}`.trim()),
    ]);
  }
  const assessed = t.software.filter((s) => s.cveLookup === "performed");
  const allCves = assessed.flatMap((s) => s.cves);
  const maxCvss = allCves.reduce((max, c) => Math.max(max, c.cvss ?? 0), 0);
  const lookupHappened = assessed.length > 0;

  const findings: Finding[] = [
    finding("cve.versionDisclosure", "No software version disclosed in public responses",
      t.versionDisclosed ? 0 : 5, 5,
      t.versionDisclosed
        ? `Software observed with a version string: ${t.software.filter((s) => s.version).map((s) => `${s.product} ${s.version}`).join(", ")}.`
        : "No versioned software was disclosed in the observed response headers or generator tag."),
  ];

  if (lookupHappened) {
    findings.push(
      finding("cve.critical", "No associated public CVE at CVSS 9.0 or above", maxCvss >= 9 ? 0 : 6, 6,
        maxCvss >= 9
          ? `Observed software has an associated public CVE with a base score of ${maxCvss}. This is an association from the observed version string, not a confirmation that the target is affected.`
          : "No associated public CVE at or above CVSS 9.0 was found for the observed versions."),
      finding("cve.high", "No associated public CVE at CVSS 7.0 or above", maxCvss >= 7 ? 0 : 4, 4,
        maxCvss >= 7
          ? `The highest associated public CVE base score for the observed versions is ${maxCvss}.`
          : "No associated public CVE at or above CVSS 7.0 was found for the observed versions."),
    );
  } else {
    findings.push(
      finding("cve.lookup", "Associated public CVE lookup", 0, 0,
        "No observed software carried both a version and a known CPE mapping, so no associated public CVE lookup was performed."),
    );
  }

  return toCategory("cve", findings);
}

export function buildCategories(a: EngineAResult, b: EngineBResult): CategoryScore[] {
  return [governance(a), transport(b), headers(b), email(b), dns(b), cve(b)];
}

/**
 * Categories that could not be assessed are removed from the denominator, so a
 * scanner side outage never presents as a worse vendor posture.
 */
export function overallScore(categories: CategoryScore[]): number {
  const assessed = categories.filter((category) => category.pointsAvailable > 0);
  const weightAssessed = assessed.reduce((sum, category) => sum + category.weight, 0);
  if (weightAssessed === 0) return 0;
  const earned = assessed.reduce((sum, category) => sum + category.score, 0);
  return (earned / weightAssessed) * 100;
}
