import Link from "next/link";
import { GradeBadge } from "@/components/GradeBadge";
import { ScanForm } from "@/components/ScanForm";
import { SCOPE_LINE } from "@/components/ReportView";
import { liveScansEnabled } from "@/lib/live-scans";
import { listSampleSummaries } from "@/lib/samples";

// The page carries the scan field, so the flag has to be read per request.
// Prerendering would freeze it at build time and an instance deployed with
// scanning switched off would still offer a working form.
export const dynamic = "force-dynamic";

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

// Best first, so the sample cards show the grade scale in order rather than in
// alphabetical order of domain. A letter outside the scale sorts last.
function gradeRank(grade: string): number {
  const index = GRADE_ORDER.indexOf(grade);
  return index === -1 ? GRADE_ORDER.length : index;
}

export default async function Home() {
  const samples = (await listSampleSummaries()).sort(
    (left, right) => gradeRank(left.grade) - gradeRank(right.grade),
  );
  return (
    <main className="wrap">
      <h1 className="masthead">Sentinel</h1>
      <p className="lede">
        Sentinel reviews the public security posture of a vendor using only what anyone can already
        see: the pages a visitor can load, a standard TLS handshake, public DNS records, and public
        Certificate Transparency logs.
      </p>
      <p className="scope-band">{SCOPE_LINE}</p>
      <section>
        <h2 className="eyebrow">Run a scan</h2>
        <ScanForm enabled={liveScansEnabled()} />
        <p className="form-note">
          Sentinel never logs in, never probes, and never sends anything a normal reader would not.
          One cloud browser session and one sandbox per scan.
        </p>
      </section>
      <section className="section">
        <h2 className="eyebrow">Sample reports</h2>
        <div className="sample-grid">
          {samples.map((sample) => (
            <Link key={sample.slug} className="sample-card" href={`/samples/${sample.slug}`}>
              <GradeBadge grade={sample.grade} small />
              <span>
                <span className="sample-domain mono">{sample.slug}</span>
                <span className="sample-score mono">
                  {sample.score}, assessed on {sample.assessedPoints} of 100
                </span>
              </span>
            </Link>
          ))}
        </div>
        <p className="form-note">
          Stored reports from real scans. Opening one runs nothing and spends no credits.
        </p>
      </section>
    </main>
  );
}
