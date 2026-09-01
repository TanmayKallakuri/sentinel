import { Solari } from "@solarisdk/browser";
import { BROWSER_TOTAL_TIMEOUT_MS } from "@/lib/config";

function requireApiKey(): string {
  const key = process.env.SOLARI_API_KEY;
  if (!key) throw new Error("SOLARI_API_KEY is not set");
  return key;
}

/**
 * One browser session per scan. The proxy option is deliberately not set:
 * Sentinel only visits the vendor's own public pages, so proxied egress would
 * add per gigabyte cost with no benefit. Captcha solving stays enabled as a
 * fallback for trust pages behind an interstitial.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withBrowser<T>(fn: (browser: any) => Promise<T>): Promise<T> {
  const solari = new Solari({ apiKey: requireApiKey() });
  const browser = await solari.launch({ stealth: true, captcha: true });
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Engine A exceeded its total budget")),
      BROWSER_TOTAL_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([fn(browser), deadline]);
  } finally {
    clearTimeout(timer);
    // browser.close() releases the session. solari.close() is separately
    // required in Node: the client holds a loopback proxy server open for its
    // connection retry path, and that handle keeps the event loop alive, so a
    // script that skips it prints its output and then hangs forever.
    await browser.close().catch(() => undefined);
    await solari.close().catch(() => undefined);
  }
}
