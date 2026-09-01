import type { ObservedSoftware, Report } from "@/lib/types";
import { CategorySection } from "./CategorySection";
import { STATUS_LABEL, STATUS_TITLE } from "./FindingRow";
import { ScoreHeader } from "./ScoreHeader";
import { ScreenshotGallery } from "./ScreenshotGallery";

const LOOKUP_NOTE: Record<ObservedSoftware["cveLookup"], string> = {
  performed: "Associated public CVEs were looked up for this version.",
  skipped_no_cpe: "No known CPE mapping, so no CVE lookup was performed.",
  skipped_no_version: "No version was disclosed, so no CVE lookup was performed.",
  unavailable: "The CVE lookup service could not be reached.",
};

function SoftwareList({ software }: { software: ObservedSoftware[] }) {
  if (software.length === 0) {
    return (
      <p className="muted" style={{ margin: "8px 0 0" }}>
        No software product or version was disclosed in the observed public responses.
      </p>
    );
  }
  return (
    <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
      {software.map((item) => (
        <li key={`${item.product}-${item.version ?? "unversioned"}-${item.source}`} className="finding">
          <strong>{item.product}</strong>
          {item.version ? <span className="mono"> {item.version}</span> : null}
          <p className="muted mono evidence">
            Observed in {item.source}
            {item.cpe ? ` as ${item.cpe}` : ""}.
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {LOOKUP_NOTE[item.cveLookup]}
          </p>
          {item.cves.length > 0 ? (
            <p className="mono evidence" style={{ margin: "4px 0 0" }}>
              {item.cves
                .map((cve) => `${cve.id}${cve.cvss === undefined ? "" : ` (CVSS ${cve.cvss})`}`)
                .join(", ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ReportView({ report }: { report: Report }) {
  const ct = report.subdomains;

  return (
    <article>
      <ScoreHeader report={report} />
      <hr className="rule" />
      <p className="muted">
        Every finding below is an observation from public data. Scores are derived from those
        observations by a fixed rubric. Nothing here asserts that this vendor is vulnerable.
      </p>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        <span className="chip chip-unavailable" title={STATUS_TITLE.unavailable}>
          {STATUS_LABEL.unavailable}
        </span>{" "}
        marks a check Sentinel could not run.{" "}
        <span className="chip chip-unverified" title={STATUS_TITLE.unverified}>
          {STATUS_LABEL.unverified}
        </span>{" "}
        marks a check that ran and then declined to read what it reached, such as a trust page that
        redirected to a domain outside the scan target. Both are excluded from the score, and they
        are not the same fact.
      </p>
      {report.executiveSummary ? (
        <section className="card" style={{ margin: "20px 0" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Executive summary</h2>
          <p className="muted mono" style={{ margin: "0 0 8px" }}>
            Generated narrative from {report.executiveSummary.model}. The score does not depend on
            it.
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{report.executiveSummary.text}</p>
        </section>
      ) : null}
      <div style={{ marginTop: 20 }}>
        {report.categories.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
      </div>
      <ScreenshotGallery screenshots={report.screenshots} />
      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Passive attack surface</h2>
        <p className="muted">
          {ct.status === "unavailable"
            ? "Certificate Transparency lookup was unavailable for this scan."
            : `${ct.total} names appear in public Certificate Transparency logs according to ${ct.source}. This is informational and is not scored.`}
        </p>
        {ct.sample.length > 0 ? (
          <>
            {ct.total > ct.sample.length ? (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Showing {ct.sample.length} of them.
              </p>
            ) : null}
            <p className="mono muted evidence">{ct.sample.join(", ")}</p>
          </>
        ) : null}
        <h3 style={{ margin: "16px 0 0", fontSize: 16 }}>Software observed</h3>
        <SoftwareList software={report.observedSoftware} />
      </section>
      {report.notes.length > 0 ? (
        <section className="card" style={{ marginTop: 20 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Scan notes</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
