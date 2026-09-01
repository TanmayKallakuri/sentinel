import { MAX_DKIM_SELECTORS } from "@/lib/config";
import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { EmailAuthResult } from "@/lib/types";
import { buildDohScript, parseDohSections, txtStrings, type DohQuery, type DohSection } from "./doh";

/** Common published selectors. Absence of a selector is not absence of DKIM. */
export const DKIM_SELECTORS = ["selector1", "selector2", "google", "default", "dkim", "k1"].slice(
  0,
  MAX_DKIM_SELECTORS,
);

export function emailQueries(domain: string): DohQuery[] {
  return [
    { name: domain, type: "TXT" },
    { name: `_dmarc.${domain}`, type: "TXT" },
    ...DKIM_SELECTORS.map((selector) => ({
      name: `${selector}._domainkey.${domain}`,
      type: "TXT",
    })),
  ];
}

function unavailable(error: string): EmailAuthResult {
  return {
    status: "unavailable",
    spf: { present: false },
    dmarc: { present: false },
    dkim: { selectorsTried: DKIM_SELECTORS, found: [] },
    error,
  };
}

export function parseEmailAuth(sections: DohSection[], domain: string): EmailAuthResult {
  const byName = new Map<string, DohSection>(sections.map((section) => [section.name, section]));
  const everyLookupFailed = sections.length === 0 || sections.every((s) => s.status === -1);
  if (everyLookupFailed) return unavailable("No DNS answers were returned.");

  const spfRecord = txtStrings(byName.get(domain)).find((value) => value.toLowerCase().startsWith("v=spf1"));
  const allQualifier = spfRecord
    ? (/([-~?+])all\b/.exec(spfRecord)?.[0] as EmailAuthResult["spf"]["allQualifier"])
    : undefined;

  const dmarcRecord = txtStrings(byName.get(`_dmarc.${domain}`)).find((value) =>
    value.toLowerCase().startsWith("v=dmarc1"),
  );
  const policyMatch = dmarcRecord ? /\bp\s*=\s*(none|quarantine|reject)\b/i.exec(dmarcRecord) : null;

  const found = DKIM_SELECTORS.filter((selector) =>
    txtStrings(byName.get(`${selector}._domainkey.${domain}`)).some((value) =>
      /v=DKIM1|k=rsa|(^|;)\s*p=/i.test(value),
    ),
  );

  return {
    status: "info",
    spf: { present: Boolean(spfRecord), record: spfRecord, allQualifier },
    dmarc: {
      present: Boolean(dmarcRecord),
      record: dmarcRecord,
      policy: policyMatch?.[1]?.toLowerCase() as EmailAuthResult["dmarc"]["policy"],
    },
    dkim: { selectorsTried: DKIM_SELECTORS, found },
  };
}

export async function checkEmailAuth(runner: SandboxRunner, domain: string): Promise<EmailAuthResult> {
  try {
    const args = emailQueries(domain).flatMap((query) => [query.name, query.type]);
    const result = await runner.run(buildDohScript(), args);
    return parseEmailAuth(parseDohSections(result.stdout), domain);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
