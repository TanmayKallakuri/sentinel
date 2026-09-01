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
