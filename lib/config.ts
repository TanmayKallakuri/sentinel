// Every tunable in one place so a reviewer can audit request volume and
// timeouts without reading the engines.
export const MAX_TRUST_PAGES = 12;
export const MAX_LINK_FOLLOW = 2;
// These three have to agree. Engine A visits at most MAX_TRUST_PAGES pages,
// each costing up to PAGE_TIMEOUT_MS plus a one second throttle, so the worst
// case is 12 * 16s = 192s and the total budget has to exceed it. It previously
// did not: a 20s page timeout against a 180s budget meant a slow vendor aborted
// the whole engine mid scan, which a fast vendor never revealed.
export const PAGE_TIMEOUT_MS = 15_000;
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
export const MAX_INLINE_SCREENSHOTS = 6;
export const MAX_SCREENSHOT_BYTES = 600_000;
export const RATE_LIMIT_PER_IP_PER_HOUR = 3;
export const RATE_LIMIT_GLOBAL_PER_HOUR = 20;

export const DEFAULT_USER_AGENT =
  "SentinelPostureBot/0.1 (passive vendor security posture review; public data only)";

export function userAgent(): string {
  return process.env.SENTINEL_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}
