import type { Grade, Report } from "@/lib/types";

const GRADE_COLOUR: Record<Grade, string> = {
  A: "var(--moss-deep)",
  B: "var(--moss-deep)",
  C: "var(--amber-deep)",
  D: "var(--clay-deep)",
  F: "var(--clay-deep)",
};

function scannedAt(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toUTCString();
}

export function ScoreHeader({ report }: { report: Report }) {
  const timings = report.timings.engines
    .map((t) => `Engine ${t.engine} ${t.elapsedMs}ms${t.status === "error" ? " (error)" : ""}`)
    .concat(`total ${report.timings.totalMs}ms`)
    .join(" | ");

  return (
    <header className="card" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
      <div
        style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, color: GRADE_COLOUR[report.grade] }}
        aria-label={`Grade ${report.grade}`}
      >
        {report.grade}
      </div>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 24, overflowWrap: "anywhere" }}>{report.domain}</h1>
        <p style={{ margin: "4px 0 0" }}>
          {report.overallScore} out of 100, assessed on {report.assessedPoints} of 100 points.
        </p>
        {report.assessedPoints < 100 ? (
          <p className="muted" style={{ margin: "4px 0 0" }}>
            The remaining {100 - report.assessedPoints} points belong to checks that could not be
            assessed. They are excluded from both sides of the score rather than counted as lost.
          </p>
        ) : null}
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Scanned {scannedAt(report.scannedAt)}.
        </p>
        <p className="muted mono" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>
          {timings}
        </p>
      </div>
    </header>
  );
}
