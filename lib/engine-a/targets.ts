import { MAX_TRUST_PAGES, MAX_LINK_FOLLOW } from "@/lib/config";
import { isAllowed, type RobotsRules } from "@/lib/robots";

const ROOT_PATHS = [
  "/",
  "/security",
  "/trust",
  "/privacy",
  "/legal",
  "/.well-known/security.txt",
  "/security.txt",
];

const TRUST_SUBDOMAINS = ["trust", "security", "status"];

// A fixed probe list, not a crawl. The reserved budget leaves room for the links Engine A follows.
export function buildTargets(domain: string): string[] {
  const urls = [
    ...ROOT_PATHS.map((path) => `https://${domain}${path}`),
    ...TRUST_SUBDOMAINS.map((sub) => `https://${sub}.${domain}/`),
  ];
  const budget = MAX_TRUST_PAGES - MAX_LINK_FOLLOW;
  return [...new Set(urls)].slice(0, budget);
}

/**
 * A followed link is in scope only when its host is the target domain itself or
 * a subdomain of it. A bare endsWith would accept notacme.com while scanning
 * acme.com, which anyone can register: that would send a cloud browser to a
 * domain the user never asked about, and let a third party's page supply
 * governance evidence attributed to the vendor.
 */
export function isSameSite(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase().replace(/\.$/, "");
  return host === root || host.endsWith(`.${root}`);
}

export function filterTargetsByRobots(
  targets: string[],
  rulesByHost: Map<string, RobotsRules>,
): { url: string; allowed: boolean }[] {
  return targets.map((url) => {
    const parsed = new URL(url);
    const rules = rulesByHost.get(parsed.hostname);
    return { url, allowed: rules ? isAllowed(rules, parsed.pathname) : true };
  });
}
