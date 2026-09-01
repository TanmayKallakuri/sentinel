"use client";

import { useState } from "react";
import type { Report } from "@/lib/types";
import { ReportView } from "./ReportView";

// Above the route's own 300 second budget, so a stalled connection ends in a
// message rather than a button that never comes back.
const CLIENT_TIMEOUT_MS = 305_000;

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

export function ScanForm() {
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

  return (
    <>
      <form onSubmit={submit} className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
      <div aria-live="polite">
        {state === "running" ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Driving a cloud browser across the public trust surface and running passive checks in a
            sandbox. This takes about a minute.
          </p>
        ) : null}
        {error ? (
          <p style={{ marginTop: 12, color: "var(--clay-deep)" }} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {report ? (
        <div style={{ marginTop: 24 }}>
          <ReportView report={report} />
        </div>
      ) : null}
    </>
  );
}
