import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { liveScansEnabled } from "@/lib/live-scans";

export const metadata = {
  title: "Run a scan | Sentinel",
  description: "Run a passive vendor security posture review from public data only.",
};

// Without this the page prerenders and the flag is frozen at build time, so an
// instance deployed with scanning switched off would still offer the form.
export const dynamic = "force-dynamic";

// The flag is read here on the server and handed down as a prop, so it never
// has to be exposed to the browser bundle to reach the form.
export default function ScanPage() {
  const enabled = liveScansEnabled();

  return (
    <main className="wrap">
      <p className="mono">
        <Link href="/">Sentinel</Link>
      </p>
      <h1 style={{ margin: "8px 0 0", fontSize: 28 }}>Run a scan</h1>
      <p className="muted" style={{ margin: "8px 0 20px" }}>
        Sentinel reads only public pages, public DNS, a standard TLS handshake, and public
        Certificate Transparency logs. It never authenticates and never sends anything but GET
        requests. Live scans are rate limited per visitor and in total.
      </p>
      <ScanForm enabled={enabled} />
    </main>
  );
}
