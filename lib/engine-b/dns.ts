import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { DnsResult } from "@/lib/types";
import { buildDohScript, parseDohSections, type DohQuery, type DohSection } from "./doh";

export function dnsQueries(domain: string): DohQuery[] {
  return [
    { name: domain, type: "CAA" },
    { name: domain, type: "DS" },
  ];
}

function unavailable(error: string): DnsResult {
  return {
    status: "unavailable",
    caa: { present: false, records: [] },
    dnssec: { present: false, dsRecords: 0, authenticatedData: false },
    error,
  };
}

export function parseDnsHygiene(sections: DohSection[], domain: string): DnsResult {
  const caaSection = sections.find((s) => s.name === domain && s.type === "CAA");
  const dsSection = sections.find((s) => s.name === domain && s.type === "DS");

  if (!caaSection || !dsSection || (caaSection.status === -1 && dsSection.status === -1)) {
    return unavailable("No DNS answers were returned.");
  }

  // CAA record data is returned in different encodings by different resolvers,
  // so it is recorded verbatim and only its presence is interpreted.
  const caaRecords = caaSection.answers.filter((a) => a.type === 257).map((a) => a.data);
  const dsRecords = dsSection.answers.filter((a) => a.type === 43).length;

  return {
    status: "info",
    caa: { present: caaRecords.length > 0, records: caaRecords },
    dnssec: {
      present: dsRecords > 0,
      dsRecords,
      authenticatedData: caaSection.authenticatedData || dsSection.authenticatedData,
    },
  };
}

export async function checkDns(runner: SandboxRunner, domain: string): Promise<DnsResult> {
  try {
    const args = dnsQueries(domain).flatMap((query) => [query.name, query.type]);
    const result = await runner.run(buildDohScript(), args);
    return parseDnsHygiene(parseDohSections(result.stdout), domain);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
