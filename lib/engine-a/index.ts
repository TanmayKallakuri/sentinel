import { randomUUID } from "node:crypto";
import {
  MAX_LINK_FOLLOW,
  MAX_INLINE_SCREENSHOTS,
  PAGE_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  userAgent,
} from "@/lib/config";
import { fetchRobots, type RobotsRules } from "@/lib/robots";
import { persistForDev, toScreenshot } from "@/lib/screenshots";
import type { EngineAResult, PageVisit, Screenshot } from "@/lib/types";
import { buildTargets, filterTargetsByRobots, isSameSite } from "./targets";
import { detectSignals } from "./signals";
import { withBrowser } from "@/lib/solari/browser";

// Between navigations in one worker, on top of the seconds a navigation already
// takes, so the effective rate per worker stays well under one page per second.
const THROTTLE_MS = 300;

// Tabs open at once inside the single browser session. The trust surface is a
// dozen independent pages and nothing about one informs the next, so the pass
// costs the slowest page rather than the sum of all of them. Four is enough to
// hide the slow pages behind each other without opening a dozen tabs against
// one host at once.
const CONCURRENCY = 4;

const FOLLOW_KEYWORDS = /sub-?processor|status|uptime|trust|security/i;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Paths and hosts that frequently do not exist, so they get the short ceiling. */
function isProbe(url: string): boolean {
  const parsed = new URL(url);
  return /^(trust|security)\./.test(parsed.hostname) || parsed.pathname.endsWith("security.txt");
}

export async function runEngineA(domain: string, scanId: string): Promise<EngineAResult> {
  const targets = buildTargets(domain);
  const hosts = [...new Set(targets.map((url) => new URL(url).hostname))];

  const robotsController = new AbortController();
  const robotsTimer = setTimeout(() => robotsController.abort(), 8_000);
  const rulesByHost = new Map<string, RobotsRules>();
  try {
    // Four independent GETs to four hosts. Sequentially they cost seconds of the
    // scan budget for no reason; nothing here depends on the previous answer.
    const fetched = await Promise.all(
      hosts.map(async (host) => [host, await fetchRobots(host, robotsController.signal)] as const),
    );
    for (const [host, rules] of fetched) rulesByHost.set(host, rules);
  } finally {
    clearTimeout(robotsTimer);
  }

  const planned = filterTargetsByRobots(targets, rulesByHost);
  const pages: PageVisit[] = [];
  const screenshots: Screenshot[] = [];
  const collected: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  // Reserved synchronously, because screenshots.length is not a safe test once
  // several tabs run at once: every worker passes the check before any of them
  // finishes its await and pushes, and the cap is silently exceeded.
  let shotsReserved = 0;

  await withBrowser(async (browser) => {
    for (const target of planned) {
      if (!target.allowed) {
        pages.push({ url: target.url, status: "skipped_by_robots" });
      }
    }

    /**
     * Visits one URL on its own tab and records what it found. Returns the
     * same site links worth following, which the caller decides about, so a
     * worker never races another worker over the follow budget.
     */
    async function visit(page: unknown, url: string): Promise<string[]> {
      const tab = page as {
        goto: (u: string, o: unknown) => Promise<{ status: () => number } | null>;
        url: () => string;
        title: () => Promise<string>;
        evaluate: (fn: unknown) => Promise<string>;
        screenshot: (o: unknown) => Promise<Buffer>;
        $$eval: (sel: string, fn: unknown) => Promise<{ href: string; text: string }[]>;
      };
      const pageStartedAt = Date.now();
      try {
        const response = await tab.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: isProbe(url) ? PROBE_TIMEOUT_MS : PAGE_TIMEOUT_MS,
        });
        const httpStatus: number | undefined = response?.status();
        if (!httpStatus || httpStatus >= 400) {
          pages.push({ url, status: "not_found", httpStatus, elapsedMs: Date.now() - pageStartedAt });
          return [];
        }

        // The same site check on the link href happens before navigation, and
        // goto follows redirects, so it has to run again on where we actually
        // landed. This is not hypothetical: status.github.com answers 301 to
        // www.githubstatus.com, and several trust pages redirect to third party
        // portals. Reading that page would let another domain's content supply
        // governance evidence credited to this vendor.
        const landedHost = (() => {
          try {
            return new URL(tab.url()).hostname;
          } catch {
            return "";
          }
        })();
        if (!isSameSite(landedHost, domain)) {
          pages.push({
            url,
            status: "redirected_offsite",
            httpStatus,
            redirectedTo: landedHost,
            elapsedMs: Date.now() - pageStartedAt,
          });
          return [];
        }

        const title: string = await tab.title();
        // evaluate and $$eval are Playwright's page context APIs, not JavaScript
        // eval. They serialise the function and run it in the visited page.
        // Nothing from the page is ever evaluated back here.
        const text: string = await tab.evaluate(
          () => document.body?.innerText?.slice(0, 200_000) ?? "",
        );
        collected.push({ url, text });

        // Screenshot only pages that actually produced evidence, plus the root.
        // A probed path is not always the vendor's page: github.com/trust is a
        // user profile, because /trust is a user namespace on that platform, and
        // capturing it published an uninvolved person's avatar, name and
        // follower count inside a security report about GitHub. Evidence
        // screenshots should be of pages that are evidence.
        const isRoot = new URL(url).pathname === "/";
        const contributed = detectSignals([{ url, text }]).some((signal) => signal.found);
        let screenshotId: string | undefined;
        if ((isRoot || contributed) && shotsReserved < MAX_INLINE_SCREENSHOTS) {
          shotsReserved += 1;
          const buffer: Buffer = await tab.screenshot({
            fullPage: true,
            type: "jpeg",
            quality: 60,
          });
          const id = randomUUID();
          const shot = toScreenshot(buffer, url, id);
          if (shot) {
            screenshots.push(shot);
            screenshotId = id;
            await persistForDev(scanId, id, buffer).catch(() => undefined);
          }
        }

        pages.push({
          url,
          status: "loaded",
          httpStatus,
          title,
          textLength: text.length,
          screenshotId,
          elapsedMs: Date.now() - pageStartedAt,
        });

        const links = await tab.$$eval("a[href]", (nodes: Element[]) =>
          nodes.slice(0, 400).map((node) => ({
            href: (node as HTMLAnchorElement).href,
            text: (node as HTMLAnchorElement).textContent ?? "",
          })),
        );
        const candidates: string[] = [];
        for (const link of links) {
          if (!FOLLOW_KEYWORDS.test(link.text) && !FOLLOW_KEYWORDS.test(link.href)) continue;
          let candidate: URL;
          try {
            candidate = new URL(link.href);
          } catch {
            continue;
          }
          if (candidate.protocol !== "https:") continue;
          if (!isSameSite(candidate.hostname, domain)) continue;
          if (!filterTargetsByRobots([candidate.toString()], rulesByHost)[0]?.allowed) continue;
          candidates.push(candidate.toString());
        }
        return candidates;
      } catch (error) {
        // A page that will not load is a finding, not a scan failure. Recording
        // it with its reason keeps one bad trust page from losing the other
        // eleven, and keeps the report honest about what was not seen.
        pages.push({
          url,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - pageStartedAt,
        });
        return [];
      }
    }

    /** Drains a shared queue across a fixed number of tabs. */
    async function drain(queue: string[]): Promise<string[]> {
      const found: string[] = [];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        const tab = await browser.newPage();
        await tab.setExtraHTTPHeaders({ "user-agent": userAgent() });
        try {
          for (;;) {
            const url = queue.shift();
            if (!url) return;
            if (seen.has(url)) continue;
            seen.add(url);
            await delay(THROTTLE_MS);
            found.push(...(await visit(tab, url)));
          }
        } finally {
          await tab.close().catch(() => undefined);
        }
      });
      await Promise.all(workers);
      return found;
    }

    const candidates = await drain(planned.filter((t) => t.allowed).map((t) => t.url));

    // The follow budget is spent after the planned pass rather than during it,
    // so two workers cannot both claim the last slot.
    const follows = candidates.filter((url) => !seen.has(url)).slice(0, MAX_LINK_FOLLOW);
    if (follows.length > 0) await drain(follows);
  });

  const offsiteRedirects = pages.flatMap((visit) =>
    visit.status === "redirected_offsite" && visit.redirectedTo
      ? [{ url: visit.url, redirectedTo: visit.redirectedTo }]
      : [],
  );

  return {
    signals: detectSignals(collected, offsiteRedirects),
    pages,
    screenshots,
    robotsRespected: true,
  };
}
