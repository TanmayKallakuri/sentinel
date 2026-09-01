import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimit } from "@/lib/rate-limit";
import { fixtureReport } from "./fixtures/report";

// runScan is stubbed so the enabled path can be exercised without a browser
// session, a sandbox, or a single credit.
const runScan = vi.hoisted(() => vi.fn());
vi.mock("@/lib/orchestrator", () => ({ runScan }));

const { POST } = await import("@/app/api/scan/route");

function post(domain: unknown): NextRequest {
  return new NextRequest("https://sentinel.example/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ domain }),
  });
}

const previous = process.env.LIVE_SCANS_ENABLED;

beforeEach(() => {
  resetRateLimit();
  runScan.mockReset();
  runScan.mockResolvedValue(fixtureReport);
  delete process.env.LIVE_SCANS_ENABLED;
});

afterEach(() => {
  if (previous === undefined) delete process.env.LIVE_SCANS_ENABLED;
  else process.env.LIVE_SCANS_ENABLED = previous;
});

describe("POST /api/scan with live scans disabled", () => {
  it("answers 503 and points the reader at the bundled samples", async () => {
    process.env.LIVE_SCANS_ENABLED = "false";
    const response = await POST(post("acme-vendor.example.com"));
    expect(response.status).toBe(503);

    const body: unknown = await response.json();
    expect(body).toMatchObject({ samples: "/" });
    const error = (body as { error: string }).error;
    expect(error).toContain("switched off");
    expect(error).toContain("sample");
  });

  it("never reaches the scan, so no session and no credit can be spent", async () => {
    process.env.LIVE_SCANS_ENABLED = "false";
    await POST(post("acme-vendor.example.com"));
    expect(runScan).not.toHaveBeenCalled();
  });

  it("short circuits ahead of the rate limiter, so a refusal costs no budget", async () => {
    process.env.LIVE_SCANS_ENABLED = "false";
    for (let i = 0; i < 20; i += 1) await POST(post("acme-vendor.example.com"));

    delete process.env.LIVE_SCANS_ENABLED;
    expect((await POST(post("acme-vendor.example.com"))).status).toBe(200);
  });

  it("reads the flag case insensitively", async () => {
    for (const value of ["false", "False", "FALSE", " False "]) {
      process.env.LIVE_SCANS_ENABLED = value;
      expect((await POST(post("acme-vendor.example.com"))).status).toBe(503);
    }
  });

  it("refuses before the body is parsed, so a malformed request still says why", async () => {
    process.env.LIVE_SCANS_ENABLED = "false";
    const request = new NextRequest("https://sentinel.example/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect((await POST(request)).status).toBe(503);
  });
});

describe("POST /api/scan with live scans enabled", () => {
  it("runs the scan when the flag is unset", async () => {
    const response = await POST(post("acme-vendor.example.com"));
    expect(response.status).toBe(200);
    expect(runScan).toHaveBeenCalledWith("acme-vendor.example.com");
    expect(await response.json()).toEqual(fixtureReport);
  });

  it("runs the scan when the flag is any value other than false", async () => {
    for (const value of ["true", "1", "yes", ""]) {
      resetRateLimit();
      process.env.LIVE_SCANS_ENABLED = value;
      expect((await POST(post("acme-vendor.example.com"))).status).toBe(200);
    }
  });

  it("still rejects a bad domain and still rate limits", async () => {
    expect((await POST(post("not a domain"))).status).toBe(400);
    expect(runScan).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i += 1) {
      expect((await POST(post("acme-vendor.example.com"))).status).toBe(200);
    }
    expect((await POST(post("acme-vendor.example.com"))).status).toBe(429);
  });
});
