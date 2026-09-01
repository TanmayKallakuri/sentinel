import Link from "next/link";
import { listSampleSummaries } from "@/lib/samples";

export default async function Home() {
  const samples = await listSampleSummaries();
  return (
    <main className="wrap">
      <h1 style={{ fontSize: 32 }}>Sentinel</h1>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        A passive vendor security posture review. Sentinel reads only public data: pages a visitor
        can already load, a standard TLS handshake, public DNS records, and public Certificate
        Transparency logs. It never logs in, never probes, and never sends anything a normal reader
        would not.
      </p>
      <p className="muted" style={{ margin: "8px 0 0" }}>
        Findings are observations. The score is derived from them by a fixed rubric, and checks that
        could not be assessed are excluded from it rather than counted as failures.
      </p>
      <hr className="rule" />
      <section className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Sample reports</h2>
        <p className="muted" style={{ margin: "8px 0 12px" }}>
          Stored reports from real scans. Opening one runs nothing and spends no credits.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {samples.map((sample) => (
            <li key={sample.slug} style={{ padding: "8px 0", borderTop: "1px solid var(--rule)" }}>
              <Link href={`/samples/${sample.slug}`}>{sample.slug}</Link>
              <span className="muted mono" style={{ marginLeft: 12 }}>
                grade {sample.grade}, {sample.score} of 100, assessed on {sample.assessedPoints}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Run a live scan</h2>
        <p className="muted" style={{ margin: "8px 0 12px" }}>
          One cloud browser session and one sandbox per scan. A scan takes about a minute.
        </p>
        <Link href="/scan">Open the scan page</Link>
      </section>
    </main>
  );
}
