import { MAX_CT_SUBDOMAINS_SHOWN, userAgent } from "@/lib/config";
import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { CtResult } from "@/lib/types";

/**
 * One public Certificate Transparency log mirror, retried with backoff. crt.sh
 * answers 502 often enough that a single attempt reports a healthy vendor as
 * unassessed, which is a worse error than waiting. Three attempts at ten
 * seconds with two and four second backoffs stay inside the per check timeout.
 * A retry is not a second source: falling back to another log aggregator would
 * change what the finding means, so a failure stays a failure.
 */
export const CT_SCRIPT = `
set -u
D="$1"
UA="$2"
BODY=""
for delay in 0 2 4; do
  if [ "$delay" -gt 0 ]; then sleep "$delay"; fi
  BODY=$(curl -sS --max-time 10 -A "$UA" "https://crt.sh/?q=%25.$D&output=json" 2>/dev/null || true)
  case "$BODY" in
    '['*) printf '%s' "$BODY"; exit 0 ;;
  esac
done
printf '%s' "$BODY"
`;

function unavailable(error: string): CtResult {
  return { status: "unavailable", source: "crt.sh", total: 0, sample: [], error };
}

export function parseCt(stdout: string, domain: string): CtResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return unavailable("Certificate Transparency lookup did not return usable JSON.");
  }
  if (!Array.isArray(parsed)) {
    return unavailable("Certificate Transparency lookup did not return usable JSON.");
  }

  const names = new Set<string>();
  for (const entry of parsed) {
    const value: unknown = (entry as { name_value?: unknown } | null)?.name_value;
    if (typeof value !== "string") continue;
    for (const raw of value.split(/\r?\n/)) {
      const name = raw.trim().toLowerCase().replace(/^\*\./, "");
      if (!name) continue;
      if (name !== domain && !name.endsWith(`.${domain}`)) continue;
      names.add(name);
    }
  }

  const sorted = [...names].sort();
  return {
    status: "info",
    source: "crt.sh",
    total: sorted.length,
    sample: sorted.slice(0, MAX_CT_SUBDOMAINS_SHOWN),
  };
}

export async function checkCt(runner: SandboxRunner, domain: string): Promise<CtResult> {
  try {
    const result = await runner.run(CT_SCRIPT, [domain, userAgent()]);
    return parseCt(result.stdout, domain);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
