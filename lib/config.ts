// Every tunable in one place so a reviewer can audit request volume and
// timeouts without reading the engines.
export const MAX_TRUST_PAGES = 12;
export const MAX_LINK_FOLLOW = 2;
// These have to agree. Engine A visits at most MAX_TRUST_PAGES pages, each
// costing up to PAGE_TIMEOUT_MS plus the throttle, so the worst case is under
// the total budget below. It once was not: a 20s page timeout against a 180s
// budget aborted the engine mid scan on a slow vendor, which a fast one hid.
export const PAGE_TIMEOUT_MS = 15_000;
// Thin probes that often do not exist get a shorter ceiling so a hanging one
// cannot eat the budget a real page needs. Status subdomains are deliberately
// excluded: they usually do exist, and following their redirect is how the
// status page signal is earned, so cutting them short would lose a real finding.
export const PROBE_TIMEOUT_MS = 6_000;
export const BROWSER_TOTAL_TIMEOUT_MS = 240_000;
export const SANDBOX_CPU = 2;
export const SANDBOX_MEM_MB = 4096;
export const SANDBOX_TIMEOUT_MS = 600_000;
export const CHECK_TIMEOUT_MS = 45_000;
export const ENGINE_B_TOTAL_TIMEOUT_MS = 240_000;
export const MAX_DKIM_SELECTORS = 6;
export const MAX_CVE_LOOKUPS = 3;
export const NVD_SPACING_MS = 6_500;
export const MAX_CT_SUBDOMAINS_SHOWN = 50;
// Measured: a full page JPEG costs about four seconds, and screenshots were the
// single largest term in a 47 second Engine A pass. Three still evidences the
// root and the two richest trust surfaces, which is what a reader checks.
export const MAX_INLINE_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 600_000;
export const RATE_LIMIT_PER_IP_PER_HOUR = 3;
export const RATE_LIMIT_GLOBAL_PER_HOUR = 20;

export const DEFAULT_USER_AGENT =
  "SentinelPostureBot/0.1 (passive vendor security posture review; public data only)";

export function userAgent(): string {
  return process.env.SENTINEL_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}
