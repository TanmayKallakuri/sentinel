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

export interface OffsiteRedirect {
  /** The probed URL, which is on the scan target's own domain. */
  url: string;
  /** The host it landed on, outside the scan target. */
  redirectedTo: string;
}

/** A status surface is status.<domain> or a /status path on the target. */
function isStatusSurface(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.startsWith("status.") || /\/status(\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function detectSignals(
  pages: { url: string; text: string }[],
  offsiteRedirects: OffsiteRedirect[] = [],
): GovernanceSignalResult[] {
  const results: GovernanceSignalResult[] = SIGNALS.map((signal) => {
    for (const page of pages) {
      // The URL is searched alongside the text because a page's own address is
      // evidence that text alone does not carry. A live scan loaded
      // status.vercel.com successfully and still reported no status page,
      // because innerText reads "Vercel Status" and the address bar is not part
      // of the document. The same applies to /.well-known/security.txt.
      const haystack = `${page.url}\n${page.text}`;
      for (const pattern of signal.patterns) {
        const match = pattern.exec(haystack);
        if (!match) continue;
        return {
          id: signal.id,
          label: signal.label,
          found: true,
          evidence: {
            url: page.url,
            excerpt: excerptAround(haystack, match.index, match[0].length),
          },
        };
      }
    }
    return { id: signal.id, label: signal.label, found: false };
  });

  // The status page signal alone is satisfied by a redirect rather than by
  // content. status.<vendor>.com answering 301 to a status provider is the
  // vendor's own DNS and their own redirect, so its existence is the evidence
  // and nobody else's page has to be trusted for it. status.github.com to
  // www.githubstatus.com is the common shape. Every other signal is a claim
  // about content, so reaching one through an off-site redirect leaves it
  // unverified rather than found.
  const status = results.find((result) => result.id === "status_page");
  if (status && !status.found) {
    const redirect = offsiteRedirects.find((entry) => isStatusSurface(entry.url));
    if (redirect) {
      status.found = true;
      status.evidence = {
        url: redirect.url,
        raw: `${redirect.url} redirected off-site to ${redirect.redirectedTo}`,
      };
    }
  }

  return results;
}
