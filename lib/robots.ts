import { userAgent } from "@/lib/config";

export interface RobotsRules {
  /** Longest match wins, which is the behaviour defined by RFC 9309. */
  rules: { type: "allow" | "disallow"; path: string }[];
  source: "fetched" | "absent" | "error";
}

export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups = new Map<string, { type: "allow" | "disallow"; path: string }[]>();
  let currentAgents: string[] = [];
  let inGroupBody = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // A User-agent line after rules starts a new group rather than extending
      // the previous one.
      if (inGroupBody) {
        currentAgents = [];
        inGroupBody = false;
      }
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (!groups.has(agent)) groups.set(agent, []);
      continue;
    }
    if (field !== "allow" && field !== "disallow") continue;
    inGroupBody = true;
    // An empty Disallow value means allow everything, so it carries no rule.
    if (field === "disallow" && value === "") continue;
    for (const agent of currentAgents) {
      groups.get(agent)?.push({ type: field, path: value });
    }
  }

  const token = agentToken.toLowerCase();
  const matched = [...groups.keys()].find((agent) => agent !== "*" && token.startsWith(agent));
  const rules = groups.get(matched ?? "*") ?? [];
  return { rules, source: "fetched" };
}

// Every robots.txt captured from a real host uses * inside path patterns, and
// several use a trailing $, so a plain prefix compare would silently ignore
// those rules and visit pages the host asked us not to. RFC 9309 defines both.
function matchesPath(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = anchored ? rulePath.slice(0, -1) : rulePath;
  if (!pattern.includes("*") && !anchored) return path.startsWith(pattern);
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

export function isAllowed(rules: RobotsRules, path: string): boolean {
  let best: { type: "allow" | "disallow"; path: string } | null = null;
  for (const rule of rules.rules) {
    if (!matchesPath(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
  }
  return best ? best.type === "allow" : true;
}

export async function fetchRobots(domain: string, signal: AbortSignal): Promise<RobotsRules> {
  const agentToken = userAgent().split("/")[0] ?? "SentinelPostureBot";
  try {
    const response = await fetch(`https://${domain}/robots.txt`, {
      signal,
      redirect: "follow",
      headers: { "user-agent": userAgent(), accept: "text/plain" },
    });
    if (!response.ok) return { rules: [], source: "absent" };
    const text = (await response.text()).slice(0, 200_000);
    return parseRobots(text, agentToken);
  } catch {
    return { rules: [], source: "error" };
  }
}
