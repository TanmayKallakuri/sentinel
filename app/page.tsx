import Link from "next/link";

export default function Home() {
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
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Run a live scan</h2>
        <p className="muted" style={{ margin: "8px 0 12px" }}>
          One cloud browser session and one sandbox per scan. A scan takes about a minute.
        </p>
        <Link href="/scan">Open the scan page</Link>
      </section>
    </main>
  );
}
