import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";

export const metadata = {
  title: "Run a scan | Sentinel",
  description: "Run a passive vendor security posture review from public data only.",
};

export default function ScanPage() {
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
      <ScanForm />
    </main>
  );
}
