import type { ObservedSoftware, Report } from "@/lib/types";
import { CategorySection } from "./CategorySection";
import { STATUS_LABEL, STATUS_TITLE } from "./FindingRow";
import { ScoreHeader } from "./ScoreHeader";
import { ScreenshotGallery } from "./ScreenshotGallery";

/**
 * The standing caveat every report carries. It is rendered unconditionally
 * directly under the score as a band across the reading column, because a
 * reader has to know the boundary of the scan to read the number above it.
 */
export const SCOPE_LINE =
  "This score reflects publicly observable, self-hosted posture only. Off-site and authenticated content is not assessed.";

const LOOKUP_NOTE: Record<ObservedSoftware["cveLookup"], string> = {
  performed: "Associated public CVEs were looked up for this version.",
  skipped_no_cpe: "No known CPE mapping, so no CVE lookup was performed.",
  skipped_no_version: "No version was disclosed, so no CVE lookup was performed.",
  unavailable: "The CVE lookup service could not be reached.",
};

function SoftwareList({ software }: { software: ObservedSoftware[] }) {
  if (software.length === 0) {
    return (
      <p className="muted sub-note">
        No software product or version was disclosed in the observed public responses.
      </p>
    );
  }
  return (
    <ul className="findings">
      {software.map((item) => (
        <li key={`${item.product}-${item.version ?? "unversioned"}-${item.source}`} className="finding">
          {/* Product and version are read off a response header, so both are
              quoted in mono. */}
          <p className="finding-label mono">
            {item.product}
            {item.version ? ` ${item.version}` : ""}
          </p>
          <p className="muted mono evidence">
            Observed in {item.source}
            {item.cpe ? ` as ${item.cpe}` : ""}.
          </p>
          <p className="muted sub-note">{LOOKUP_NOTE[item.cveLookup]}</p>
          {item.cves.length > 0 ? (
            <p className="mono evidence">
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

// Wall clock per engine and for the scan as a whole. Every cell is measured, so
// the whole table is monospace.
function TimingTable({ timings }: { timings: Report["timings"] }) {
  return (
    <table className="timings mono">
      <thead>
        <tr>
          <th scope="col">Stage</th>
          <th scope="col">Elapsed</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {timings.engines.map((timing) => (
          <tr key={timing.engine}>
            <th scope="row">Engine {timing.engine}</th>
            <td>{timing.elapsedMs} ms</td>
            <td>{timing.status}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Total</th>
          <td>{timings.totalMs} ms</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

export function ReportView({ report }: { report: Report }) {
  const ct = report.subdomains;

  return (
    <article>
      <ScoreHeader report={report} />
      <p className="scope-band">{SCOPE_LINE}</p>
      <p className="legend muted">
        Every finding below is an observation from public data. Scores are derived from those
        observations by a fixed rubric. Nothing here asserts that this vendor is vulnerable.
      </p>
      <p className="legend muted">
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
        <section className="card section">
          <h2 className="section-head">Executive summary</h2>
          <p className="muted mono">
            Generated narrative from {report.executiveSummary.model}. The score does not depend on
            it.
          </p>
          <p className="summary-text">{report.executiveSummary.text}</p>
        </section>
      ) : null}
      <div className="cat-grid section">
        {report.categories.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
      </div>
      <ScreenshotGallery screenshots={report.screenshots} />
      <section className="card section">
        <h2 className="section-head">Passive attack surface</h2>
        <p className="muted">
          {ct.status === "unavailable"
            ? "Certificate Transparency lookup was unavailable for this scan."
            : `${ct.total} names appear in public Certificate Transparency logs according to ${ct.source}. This is informational and is not scored.`}
        </p>
        {ct.sample.length > 0 ? (
          <>
            {ct.total > ct.sample.length ? (
              <p className="muted sub-note">Showing {ct.sample.length} of them.</p>
            ) : null}
            {/* Names read out of a public log, so they are quoted in mono. */}
            <p className="mono muted evidence">{ct.sample.join(", ")}</p>
          </>
        ) : null}
        {ct.total > 0 && ct.sample.length === 0 ? (
          // A published sample carries the count but not the names. Every name
          // is public in the logs, but an alphabetised list of a named
          // company's hosts, indexed under a graded security banner, is an
          // aggregation the source logs do not offer. A live scan shows them.
          <p className="muted sub-note">
            The names are listed in a live scan. Published samples carry the count only.
          </p>
        ) : null}
        <h3 className="section-head sub-head">Software observed</h3>
        <SoftwareList software={report.observedSoftware} />
      </section>
      {report.notes.length > 0 ? (
        <section className="card section">
          <h2 className="section-head">Scan notes</h2>
          <ul className="muted note-list">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card section">
        <h2 className="section-head">Scan timings</h2>
        <TimingTable timings={report.timings} />
      </section>
    </article>
  );
}
