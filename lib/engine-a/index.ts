import { randomUUID } from "node:crypto";
import {
  MAX_LINK_FOLLOW,
  MAX_INLINE_SCREENSHOTS,
  PAGE_TIMEOUT_MS,
  userAgent,
} from "@/lib/config";
import { fetchRobots, type RobotsRules } from "@/lib/robots";
import { persistForDev, toScreenshot } from "@/lib/screenshots";
import type { EngineAResult, PageVisit, Screenshot } from "@/lib/types";
import { buildTargets, filterTargetsByRobots } from "./targets";
import { detectSignals } from "./signals";
import { withBrowser } from "@/lib/solari/browser";

const THROTTLE_MS = 1_000;

const FOLLOW_KEYWORDS = /sub-?processor|status|uptime|trust|security/i;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runEngineA(domain: string, scanId: string): Promise<EngineAResult> {
  const targets = buildTargets(domain);
  const hosts = [...new Set(targets.map((url) => new URL(url).hostname))];

  const robotsController = new AbortController();
  const robotsTimer = setTimeout(() => robotsController.abort(), 8_000);
  const rulesByHost = new Map<string, RobotsRules>();
  try {
    for (const host of hosts) {
      rulesByHost.set(host, await fetchRobots(host, robotsController.signal));
    }
  } finally {
    clearTimeout(robotsTimer);
  }

  const planned = filterTargetsByRobots(targets, rulesByHost);
  const pages: PageVisit[] = [];
  const screenshots: Screenshot[] = [];
  const collected: { url: string; text: string }[] = [];

  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "user-agent": userAgent() });

    const queue = planned.filter((t) => t.allowed).map((t) => t.url);
    for (const target of planned) {
      if (!target.allowed) {
        pages.push({ url: target.url, status: "skipped_by_robots" });
      }
    }

    let followsRemaining = MAX_LINK_FOLLOW;
    const seen = new Set<string>();

    while (queue.length > 0) {
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      await delay(THROTTLE_MS);

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: PAGE_TIMEOUT_MS,
        });
        const httpStatus: number | undefined = response?.status();
        if (!httpStatus || httpStatus >= 400) {
          pages.push({ url, status: "not_found", httpStatus });
          continue;
        }

        const title: string = await page.title();
        // page.evaluate and page.$$eval below are Playwright's page context
        // APIs, not JavaScript eval. They serialise this function and run it in
        // the visited page. Nothing from the page is ever evaluated back here.
        const text: string = await page.evaluate(
          () => document.body?.innerText?.slice(0, 200_000) ?? "",
        );
        collected.push({ url, text });

        let screenshotId: string | undefined;
        if (screenshots.length < MAX_INLINE_SCREENSHOTS) {
          const buffer: Buffer = await page.screenshot({
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
        });

        if (followsRemaining > 0) {
          const links: { href: string; text: string }[] = await page.$$eval(
            "a[href]",
            (nodes: Element[]) =>
              nodes.slice(0, 400).map((node) => ({
                href: (node as HTMLAnchorElement).href,
                text: (node as HTMLAnchorElement).textContent ?? "",
              })),
          );
          for (const link of links) {
            if (followsRemaining === 0) break;
            if (!FOLLOW_KEYWORDS.test(link.text) && !FOLLOW_KEYWORDS.test(link.href)) continue;
            let candidate: URL;
            try {
              candidate = new URL(link.href);
            } catch {
              continue;
            }
            if (candidate.protocol !== "https:") continue;
            if (!candidate.hostname.endsWith(domain)) continue;
            if (seen.has(candidate.toString()) || queue.includes(candidate.toString())) continue;
            if (!filterTargetsByRobots([candidate.toString()], rulesByHost)[0]?.allowed) continue;
            queue.push(candidate.toString());
            followsRemaining -= 1;
          }
        }
      } catch (error) {
        // A page that will not load is a finding, not a scan failure. Recording
        // it with its reason keeps one bad trust page from losing the other
        // eleven, and keeps the report honest about what was not seen.
        pages.push({
          url,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  return {
    signals: detectSignals(collected),
    pages,
    screenshots,
    robotsRespected: true,
  };
}
