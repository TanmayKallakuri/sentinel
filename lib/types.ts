/**
 * "unavailable" means Sentinel could not run the check. "unverified" means the
 * check ran and reached something Sentinel deliberately refused to read, such as
 * a trust page that redirected to a domain outside the scan target. Both are
 * excluded from scoring, but they are different facts and the report says which.
 */
export type CheckStatus =
  | "pass"
  | "warn"
  | "fail"
  | "info"
  | "unavailable"
  | "unverified";

export interface Evidence {
  url?: string;
  screenshotId?: string;
  excerpt?: string;
  raw?: string;
}

export interface Finding {
  id: string;
  label: string;
  status: CheckStatus;
  /** Neutral statement of what was observed. Never a claim of vulnerability. */
  observation: string;
  pointsEarned: number;
  pointsAvailable: number;
  evidence?: Evidence;
}

export type CategoryId =
  | "governance"
  | "transport"
  | "headers"
  | "email"
  | "dns"
  | "cve";

export interface CategoryScore {
  id: CategoryId;
  label: string;
  weight: number;
  pointsEarned: number;
  pointsAvailable: number;
  /** Points belonging to checks that could not be run. Excluded from the ratio. */
  pointsNotAssessed: number;
  /** Absolute points earned, never scaled up to the category weight. */
  score: number;
  findings: Finding[];
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Screenshot {
  id: string;
  url: string;
  capturedAt: string;
  source: "inline" | "static";
  /** JPEG data URL for live scans. */
  dataUrl?: string;
  /** Public path for bundled sample reports. */
  path?: string;
}

export interface PageVisit {
  url: string;
  status: "loaded" | "not_found" | "error" | "skipped_by_robots" | "redirected_offsite";
  httpStatus?: number;
  title?: string;
  screenshotId?: string;
  textLength?: number;
  /** Host the request landed on when a redirect left the scan target. */
  redirectedTo?: string;
  /** Wall clock spent on this page, so a slow surface can be found and capped. */
  elapsedMs?: number;
  error?: string;
}

export type GovernanceSignalId =
  | "soc2"
  | "iso27001"
  | "pci_dss"
  | "gdpr"
  | "dpa"
  | "vuln_disclosure"
  | "bug_bounty"
  | "subprocessors"
  | "security_contact"
  | "status_page";

export interface GovernanceSignalResult {
  id: GovernanceSignalId;
  label: string;
  found: boolean;
  evidence?: Evidence;
}

export interface EngineAResult {
  signals: GovernanceSignalResult[];
  pages: PageVisit[];
  screenshots: Screenshot[];
  robotsRespected: boolean;
}

export interface TlsResult {
  status: CheckStatus;
  negotiatedProtocol?: string;
  tls13Supported?: boolean;
  tls12Supported?: boolean;
  legacyProtocolsTestable: boolean;
  chainValid?: boolean;
  verifyMessage?: string;
  issuer?: string;
  notBefore?: string;
  notAfter?: string;
  daysToExpiry?: number;
  error?: string;
  raw?: string;
}

export interface HeadersResult {
  status: CheckStatus;
  finalUrl?: string;
  httpStatus?: number;
  headers: Record<string, string | null>;
  error?: string;
}

export interface EmailAuthResult {
  status: CheckStatus;
  spf: {
    present: boolean;
    record?: string;
    allQualifier?: "-all" | "~all" | "?all" | "+all";
  };
  dmarc: {
    present: boolean;
    record?: string;
    policy?: "none" | "quarantine" | "reject";
  };
  dkim: { selectorsTried: string[]; found: string[] };
  error?: string;
}

export interface DnsResult {
  status: CheckStatus;
  caa: { present: boolean; records: string[] };
  dnssec: { present: boolean; dsRecords: number; authenticatedData: boolean };
  error?: string;
}

export interface CtResult {
  status: CheckStatus;
  /** The log source that answered. Cert Spotter is tried only if crt.sh does not. */
  source: "crt.sh" | "certspotter";
  total: number;
  sample: string[];
  error?: string;
}

export interface ObservedSoftware {
  product: string;
  version?: string;
  source: string;
  cpe?: string;
  cveLookup: "performed" | "skipped_no_cpe" | "skipped_no_version" | "unavailable";
  cves: { id: string; cvss?: number; severity?: string; published?: string }[];
}

export interface TechResult {
  status: CheckStatus;
  software: ObservedSoftware[];
  versionDisclosed: boolean;
  error?: string;
}

export interface EngineBResult {
  tls: TlsResult;
  headers: HeadersResult;
  email: EmailAuthResult;
  dns: DnsResult;
  ct: CtResult;
  tech: TechResult;
}

export interface EngineTiming {
  engine: "A" | "B";
  elapsedMs: number;
  status: "ok" | "error";
  error?: string;
}

export interface Report {
  schemaVersion: 1;
  scanId: string;
  domain: string;
  scannedAt: string;
  overallScore: number;
  /** Points that could be assessed, out of 100. The denominator of overallScore. */
  assessedPoints: number;
  grade: Grade;
  categories: CategoryScore[];
  screenshots: Screenshot[];
  subdomains: CtResult;
  observedSoftware: ObservedSoftware[];
  timings: { totalMs: number; engines: EngineTiming[] };
  executiveSummary?: { text: string; model: string; generated: true };
  /** Operator visible notes, for example checks that could not run. */
  notes: string[];
}
