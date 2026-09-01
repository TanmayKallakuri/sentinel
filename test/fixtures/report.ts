import type { Report } from "@/lib/types";

export const LONG_CSP = `default-src 'self'; ${Array.from({ length: 40 }, (_, i) => `img-src cdn${i}.example.com`).join("; ")}`;

export const fixtureReport: Report = {
  schemaVersion: 1,
  scanId: "11111111-2222-3333-4444-555555555555",
  domain: "acme-vendor.example.com",
  scannedAt: "2026-08-30T09:15:00.000Z",
  overallScore: 71.1,
  assessedPoints: 90,
  grade: "C",
  categories: [
    {
      id: "governance",
      label: "Governance and compliance",
      weight: 25,
      pointsEarned: 12,
      pointsAvailable: 25,
      pointsNotAssessed: 0,
      score: 12,
      findings: [
        {
          id: "governance.soc2",
          label: "SOC 2",
          status: "pass",
          observation: "Found on a public trust page.",
          pointsEarned: 4,
          pointsAvailable: 4,
          evidence: {
            url: "https://acme-vendor.example.com/trust",
            excerpt: "Acme maintains a SOC 2 Type II report available under NDA.",
          },
        },
        {
          id: "governance.offsite.1",
          label: "Trust surface redirected to another domain",
          status: "unverified",
          observation:
            "https://acme-vendor.example.com/security redirected to trust.thirdparty.example, which is outside the scan target, so the page content was not read.",
          pointsEarned: 0,
          pointsAvailable: 0,
          evidence: {
            url: "https://acme-vendor.example.com/security",
            raw: "https://acme-vendor.example.com/security redirected off-site to trust.thirdparty.example",
          },
        },
      ],
    },
    {
      id: "headers",
      label: "Application security headers",
      weight: 15,
      pointsEarned: 6,
      pointsAvailable: 5,
      pointsNotAssessed: 10,
      score: 6,
      findings: [
        {
          id: "headers.csp",
          label: "Content Security Policy present",
          status: "warn",
          observation: "A Content Security Policy header was returned.",
          pointsEarned: 6,
          pointsAvailable: 5,
          evidence: { raw: LONG_CSP },
        },
      ],
    },
    {
      id: "email",
      label: "Email authentication",
      weight: 15,
      pointsEarned: 0,
      pointsAvailable: 0,
      pointsNotAssessed: 15,
      score: 0,
      findings: [
        {
          id: "email.unavailable",
          label: "Email authentication",
          status: "unavailable",
          observation: "The DNS over HTTPS resolver could not be reached.",
          pointsEarned: 0,
          pointsAvailable: 0,
        },
      ],
    },
  ],
  screenshots: [
    {
      id: "shot-inline",
      url: "https://acme-vendor.example.com/trust",
      capturedAt: "2026-08-30T09:15:10.000Z",
      source: "inline",
      dataUrl: "data:image/jpeg;base64,AAAA",
    },
    {
      id: "shot-static",
      url: "https://acme-vendor.example.com/privacy",
      capturedAt: "2026-08-30T09:15:20.000Z",
      source: "static",
      path: "/samples/acme-vendor.example.com/shot-static.jpg",
    },
    {
      id: "shot-dropped",
      url: "https://acme-vendor.example.com/legal",
      capturedAt: "2026-08-30T09:15:30.000Z",
      source: "inline",
    },
  ],
  subdomains: {
    status: "info",
    source: "certspotter",
    total: 137,
    sample: ["api.acme-vendor.example.com", "www.acme-vendor.example.com"],
  },
  observedSoftware: [
    {
      product: "nginx",
      version: "1.18.0",
      source: "server header",
      cpe: "cpe:2.3:a:f5:nginx:1.18.0",
      cveLookup: "performed",
      cves: [{ id: "CVE-2021-23017", cvss: 9.4, severity: "CRITICAL" }],
    },
  ],
  timings: {
    totalMs: 51234,
    engines: [
      { engine: "A", elapsedMs: 48210, status: "ok" },
      { engine: "B", elapsedMs: 31004, status: "error", error: "sandbox timed out" },
    ],
  },
  notes: ["This report was assessed on 90 of 100 points."],
};
