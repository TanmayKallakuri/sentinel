import type { CheckStatus, Finding } from "@/lib/types";

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "pass",
  warn: "partial",
  fail: "fail",
  info: "info",
  unavailable: "unavailable",
  unverified: "unverified",
};

export const STATUS_TITLE: Record<CheckStatus, string> = {
  pass: "The check ran and the expected signal was present.",
  warn: "The check ran and the signal was present in a weaker form.",
  fail: "The check ran and the expected signal was not present.",
  info: "Recorded for context and not scored.",
  unavailable: "Sentinel could not run this check, so it is excluded from the score.",
  unverified:
    "Sentinel ran this check and then declined to read what it reached, so it is excluded from the score.",
};

// Evidence URLs come from scanned pages, so only the two schemes a report can
// legitimately cite are linked. Anything else is shown as text.
function isLinkable(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function FindingRow({ finding }: { finding: Finding }) {
  const scored = finding.pointsAvailable > 0;
  const url = finding.evidence?.url;
  return (
    <li className="finding">
      <div className="finding-head">
        <span className={`chip chip-${finding.status}`} title={STATUS_TITLE[finding.status]}>
          {STATUS_LABEL[finding.status]}
        </span>
        <strong className="finding-label">{finding.label}</strong>
        <span className="muted mono finding-points">
          {scored ? `${finding.pointsEarned} / ${finding.pointsAvailable}` : "not scored"}
        </span>
      </div>
      <p style={{ margin: "6px 0 0" }}>{finding.observation}</p>
      {url ? (
        <p className="mono muted evidence">
          Evidence:{" "}
          {isLinkable(url) ? (
            <a href={url} rel="noreferrer nofollow" target="_blank">
              {url}
            </a>
          ) : (
            url
          )}
        </p>
      ) : null}
      {finding.evidence?.excerpt ? (
        <p className="mono muted evidence">&ldquo;{finding.evidence.excerpt}&rdquo;</p>
      ) : null}
      {finding.evidence?.raw ? (
        <pre className="mono muted evidence-raw">{finding.evidence.raw}</pre>
      ) : null}
    </li>
  );
}
