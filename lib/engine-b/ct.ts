import { MAX_CT_SUBDOMAINS_SHOWN, userAgent } from "@/lib/config";
import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { CtResult } from "@/lib/types";

/**
 * crt.sh retried with backoff, then Cert Spotter once. crt.sh answers 502 for
 * hours at a time, and a single source turns a healthy vendor into an unassessed
 * one. Both are keyless mirrors of the same public logs, so the fallback does not
 * change what the finding means, and the result records which one answered. Three
 * crt.sh attempts at eight seconds with two and four second backoffs plus one ten
 * second fallback stay inside the per check timeout. The script names its source
 * on a marker line so the parser never has to infer it from the JSON shape.
 */
export const CT_SCRIPT = `
set -u
D="$1"
UA="$2"
BODY=""
for delay in 0 2 4; do
  if [ "$delay" -gt 0 ]; then sleep "$delay"; fi
  BODY=$(curl -sS --max-time 8 -A "$UA" "https://crt.sh/?q=%25.$D&output=json" 2>/dev/null || true)
  case "$BODY" in
    '['*) printf 'SOURCE crt.sh\\n%s' "$BODY"; exit 0 ;;
  esac
done
BODY=$(curl -sS --max-time 10 -A "$UA" "https://api.certspotter.com/v1/issuances?domain=$D&include_subdomains=true&expand=dns_names" 2>/dev/null || true)
case "$BODY" in
  '['*) printf 'SOURCE certspotter\\n%s' "$BODY"; exit 0 ;;
esac
printf 'SOURCE none\\n'
`;

const MARKER = /^SOURCE (crt\.sh|certspotter|none)\r?\n?([\s\S]*)$/;

function unavailable(error: string, source: CtResult["source"] = "crt.sh"): CtResult {
  return { status: "unavailable", source, total: 0, sample: [], error };
}

function unusable(answered: string | undefined): CtResult {
  if (answered === "crt.sh") return unavailable("crt.sh answered but the response was not usable JSON.");
  if (answered === "certspotter") {
    return unavailable("Cert Spotter answered but the response was not usable JSON.", "certspotter");
  }
  return unavailable("Neither crt.sh nor Cert Spotter returned usable Certificate Transparency data.");
}

/** crt.sh joins the names of one certificate with newlines; Cert Spotter lists them. */
function namesIn(entry: unknown): string[] {
  const record = entry as { name_value?: unknown; dns_names?: unknown } | null | undefined;
  const joined = record?.name_value;
  if (typeof joined === "string") return joined.split(/\r?\n/);
  const listed = record?.dns_names;
  if (Array.isArray(listed)) return listed.filter((name): name is string => typeof name === "string");
  return [];
}

export function parseCt(stdout: string, domain: string): CtResult {
  const marked = MARKER.exec(stdout.trimStart());
  const answered = marked?.[1];
  const source: CtResult["source"] = answered === "certspotter" ? "certspotter" : "crt.sh";
  const body = marked ? marked[2] ?? "" : stdout;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.trim());
  } catch {
    return unusable(answered);
  }
  if (!Array.isArray(parsed)) return unusable(answered);

  const names = new Set<string>();
  for (const entry of parsed) {
    for (const raw of namesIn(entry)) {
      const name = raw.trim().toLowerCase().replace(/^\*\./, "");
      if (!name) continue;
      if (name !== domain && !name.endsWith(`.${domain}`)) continue;
      names.add(name);
    }
  }

  const sorted = [...names].sort();
  return {
    status: "info",
    source,
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
