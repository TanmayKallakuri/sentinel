import type { Report } from "@/lib/types";
import { GradeBadge } from "./GradeBadge";

function scannedAt(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toUTCString();
}

export function ScoreHeader({ report }: { report: Report }) {
  return (
    <header className="report-head">
      <div className="report-head-main">
        {/* The domain is set in monospace because it is quoted from the target
            rather than written by Sentinel. */}
        <h1 className="report-domain">{report.domain}</h1>
        <p className="eyebrow score-eyebrow">Score out of 100</p>
        <p className="score-line">
          <span className="score-value">{report.overallScore}</span>
          <span className="score-denominator">, assessed on {report.assessedPoints} of 100</span>
        </p>
        {report.assessedPoints < 100 ? (
          <p className="muted score-note">
            The remaining {100 - report.assessedPoints} points belong to checks that could not be
            assessed. They are excluded from both sides of the score rather than counted as lost.
          </p>
        ) : null}
        <p className="muted mono report-meta">Scanned {scannedAt(report.scannedAt)}</p>
      </div>
      <GradeBadge grade={report.grade} />
    </header>
  );
}
