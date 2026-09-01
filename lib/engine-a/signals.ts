import type { GovernanceSignalId, GovernanceSignalResult } from "@/lib/types";

export interface SignalPattern {
  id: GovernanceSignalId;
  label: string;
  patterns: RegExp[];
}

/**
 * Patterns are deliberately narrow. A false positive here inflates a vendor's
 * governance score, which is the failure mode that would make the report
 * indefensible, so bare acronyms are matched case sensitively.
 */
export const SIGNALS: SignalPattern[] = [
  {
    id: "soc2",
    label: "SOC 2 attestation referenced",
    patterns: [/\bSOC\s?-?2\b/i, /\bService Organization Control\b/i],
  },
  {
    id: "iso27001",
    label: "ISO 27001 certification referenced",
    patterns: [/\bISO(?:\/IEC)?[\s-]?27001\b/i],
  },
  {
    id: "pci_dss",
    label: "PCI DSS referenced",
    patterns: [/\bPCI[\s-]?DSS\b/i, /\bPayment Card Industry Data Security Standard\b/i],
  },
  {
    id: "gdpr",
    label: "GDPR referenced",
    patterns: [/\bGDPR\b/, /\bGeneral Data Protection Regulation\b/i],
  },
  {
    id: "dpa",
    label: "Data processing agreement referenced",
    patterns: [/\bdata processing (agreement|addendum)\b/i, /\bDPA\b/],
  },
  {
    id: "vuln_disclosure",
    label: "Vulnerability disclosure policy published",
    patterns: [
      /\b(responsible|coordinated) disclosure\b/i,
      /\bvulnerability disclosure (policy|program|programme)\b/i,
      /\bsecurity\.txt\b/i,
      /\breport a (security )?(vulnerability|issue)\b/i,
    ],
  },
  {
    id: "bug_bounty",
    label: "Bug bounty program published",
    patterns: [/\bbug bount(y|ies)\b/i, /\b(hackerone|bugcrowd|intigriti|yeswehack)\b/i],
  },
  {
    id: "subprocessors",
    label: "Subprocessor list published",
    patterns: [/\bsub-?processors?\b/i],
  },
  {
    id: "security_contact",
    label: "Security contact published",
    patterns: [/security@[a-z0-9.-]+\.[a-z]{2,}/i, /^Contact:\s*mailto:/im],
  },
  {
    id: "status_page",
    label: "Status or uptime page published",
    patterns: [
      /\b(system )?status page\b/i,
      /\bhttps?:\/\/status\.[a-z0-9.-]+/i,
      /\b(statuspage\.io|instatus\.com|status\.io|betteruptime\.com)\b/i,
    ],
  },
];

const EXCERPT_RADIUS = 80;

function excerptAround(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + matchLength + EXCERPT_RADIUS);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function detectSignals(
  pages: { url: string; text: string }[],
): GovernanceSignalResult[] {
  return SIGNALS.map((signal) => {
    for (const page of pages) {
      for (const pattern of signal.patterns) {
        const match = pattern.exec(page.text);
        if (!match) continue;
        return {
          id: signal.id,
          label: signal.label,
          found: true,
          evidence: {
            url: page.url,
            excerpt: excerptAround(page.text, match.index, match[0].length),
          },
        };
      }
    }
    return { id: signal.id, label: signal.label, found: false };
  });
}
