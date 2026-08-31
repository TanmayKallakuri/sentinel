export type DomainResult =
  | { ok: true; domain: string }
  | { ok: false; reason: string };

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const TLD_SUFFIX = /\.[a-z]{2,63}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// Reserved and private names are refused because scanning them is neither public nor meaningful.
const RESERVED_SUFFIXES = [
  ".local",
  ".internal",
  ".test",
  ".invalid",
  ".localhost",
  ".example",
  ".onion",
];

/** Accepts what a user is likely to paste (bare domain, full URL, mixed case) and returns a bare hostname, or a reason it was refused. */
export function normalizeDomain(input: string): DomainResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Enter a domain." };
  if (trimmed.length > 300) return { ok: false, reason: "Input is too long." };

  const withoutScheme = trimmed.replace(SCHEME, "");
  if (/[@\s]/.test(withoutScheme)) {
    return { ok: false, reason: "Enter a bare domain with no credentials or spaces." };
  }

  // One extraction path for every input. Handing schemed input to new URL instead
  // would punycode it and drop its query string while this path does neither, so
  // the same domain would get two different verdicts depending on whether the
  // user happened to type https:// in front of it.
  // Cut at the first slash, question mark or hash, then the port, by replace
  // rather than split()[0], so there is no index access and so no unreachable
  // undefined fallback to carry.
  const host = withoutScheme
    .toLowerCase()
    .replace(/[/?#].*$/, "")
    .replace(/:.*$/, "")
    .replace(/\.$/, "");

  if (!host) return { ok: false, reason: "Enter a domain." };
  if (host.length > 253) return { ok: false, reason: "Domain is longer than 253 characters." };
  // Refused rather than punycoded, so that one input has exactly one verdict.
  // The xn-- form passes the label rule below unchanged.
  if ([...host].some((character) => character.charCodeAt(0) > 127)) {
    return {
      ok: false,
      reason: "Enter the punycode form of an international domain, for example xn--mnchen-3ya.de.",
    };
  }
  if (IPV4.test(host)) {
    return { ok: false, reason: "Enter a domain name, not an IP address." };
  }
  if (host === "localhost") return { ok: false, reason: "Local hosts are out of scope." };
  if (RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "Reserved and internal names are out of scope." };
  }

  const labels = host.split(".");
  if (labels.length < 2) {
    return { ok: false, reason: "Enter a full domain, for example acme.com." };
  }
  for (const label of labels) {
    if (!LABEL.test(label)) {
      return { ok: false, reason: `Invalid label in domain: "${label}".` };
    }
  }
  if (!TLD_SUFFIX.test(host)) {
    return { ok: false, reason: "Invalid top level domain." };
  }

  return { ok: true, domain: host };
}
