import { userAgent } from "@/lib/config";
import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { HeadersResult } from "@/lib/types";

export const TRACKED_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

/** A single GET to the site root, following at most three redirects. */
export const HEADERS_SCRIPT = `
set -u
D="$1"
UA="$2"
curl -sS -o /dev/null -D - -L --max-redirs 3 --max-time 20 -A "$UA" "https://$D/"
`;

function emptyHeaders(): Record<string, string | null> {
  const headers: Record<string, string | null> = {};
  for (const name of TRACKED_HEADERS) headers[name] = null;
  return headers;
}

export function parseHeaders(stdout: string): HeadersResult {
  const blocks = stdout.split(/\r?\n\r?\n/).filter((block) => /^HTTP\//m.test(block));
  const last = blocks[blocks.length - 1];
  const headers = emptyHeaders();

  if (!last) {
    return { status: "unavailable", headers, error: "No HTTP response headers were returned." };
  }

  let httpStatus: number | undefined;
  for (const line of last.split(/\r?\n/)) {
    const statusMatch = /^HTTP\/[\d.]+\s+(\d{3})/.exec(line);
    if (statusMatch?.[1]) {
      httpStatus = Number(statusMatch[1]);
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    // Server and X-Powered-By are kept because Task 10 fingerprints from them.
    if ((TRACKED_HEADERS as readonly string[]).includes(name) || name === "server" || name === "x-powered-by") {
      headers[name] = value;
    }
  }

  return { status: "info", httpStatus, headers };
}

export async function checkHeaders(runner: SandboxRunner, domain: string): Promise<HeadersResult> {
  try {
    const result = await runner.run(HEADERS_SCRIPT, [domain, userAgent()]);
    return parseHeaders(result.stdout);
  } catch (error) {
    return {
      status: "unavailable",
      headers: emptyHeaders(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
