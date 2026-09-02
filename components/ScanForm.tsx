"use client";

import Link from "next/link";
import { useState } from "react";
import type { Report } from "@/lib/types";
import { ReportView } from "./ReportView";

// Above the route's own 60 second budget, so a stalled connection ends in a
// message rather than a button that never comes back.
const CLIENT_TIMEOUT_MS = 70_000;

function messageFor(status: number, body: string, retryAfter: string | null): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const reported = (parsed as { error: unknown }).error;
      if (typeof reported === "string" && reported.trim()) return reported;
    }
  } catch {
    // A proxy or platform error page is not JSON. Fall through to the status.
  }
  if (status === 429) {
    const minutes = Math.ceil(Number(retryAfter ?? "0") / 60);
    return minutes > 0
      ? `Scan limit reached. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
      : "Scan limit reached. Try again later.";
  }
  return `The scan did not complete. The server answered ${status}.`;
}

// The flag itself is read on the server and arrives as a prop, because the
// browser has no business knowing the deployment's environment.
export function ScanForm({ enabled }: { enabled: boolean }) {
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<"idle" | "running">("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "running") return;
    setState("running");
    setError(null);
    setReport(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const body = await response.text();
      if (!response.ok) {
        setError(messageFor(response.status, body, response.headers.get("retry-after")));
        return;
      }
      setReport(JSON.parse(body) as Report);
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "TimeoutError"
          ? "The scan took longer than expected and was stopped. Try again."
          : "The scan could not be reached. Check your connection and try again.",
      );
    } finally {
      setState("idle");
    }
  }

  // An instance published without live scanning says so in one quiet line where
  // the field would have been, rather than in a box that outweighs the samples.
  if (!enabled) {
    return (
      <p className="form-note">
        Live scanning is switched off on this instance, so no new scan can be run here. The bundled
        sample reports are stored results from real scans and read exactly like a live one.{" "}
        <Link href="/">Open a sample report</Link>.
      </p>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="form-row">
        <input
          className="field"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="vendor.com"
          aria-label="Vendor domain"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={300}
        />
        <button className="submit" type="submit" disabled={domain.trim() === "" || state === "running"}>
          {state === "running" ? "Scanning" : "Run scan"}
        </button>
      </form>
      {state === "idle" ? (
        <p className="form-note">
          One cloud browser session and one sandbox per scan. Measured scans take nine to thirty seconds.
        </p>
      ) : null}
      <div aria-live="polite">
        {state === "running" ? (
          <p className="form-note">
            Driving a cloud browser across the public trust surface and running passive checks in a
            sandbox. This usually takes under thirty seconds.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {report ? (
        <div className="scan-result">
          <ReportView report={report} />
        </div>
      ) : null}
    </>
  );
}
