import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView, SCOPE_LINE } from "@/components/ReportView";
import { LONG_CSP, fixtureReport as report } from "./fixtures/report";
import type { Report } from "@/lib/types";

const html = renderToStaticMarkup(createElement(ReportView, { report }));

describe("ReportView", () => {
  it("carries the fixed scope line once, above the score, on every report", () => {
    expect(SCOPE_LINE).toBe(
      "This score reflects publicly observable, self-hosted posture only. Off-site and authenticated content is not assessed.",
    );
    expect(html.split(SCOPE_LINE)).toHaveLength(2);
    expect(html.indexOf(SCOPE_LINE)).toBeLessThan(html.indexOf("71.1 out of 100"));

    // A report stripped of every optional part still carries it.
    const bare: Report = {
      ...report,
      categories: [],
      screenshots: [],
      observedSoftware: [],
      notes: [],
    };
    expect(renderToStaticMarkup(createElement(ReportView, { report: bare }))).toContain(SCOPE_LINE);
  });

  it("states the score, the grade, and the assessed denominator", () => {
    expect(html).toContain("71.1 out of 100, assessed on 90 of 100 points.");
    expect(html).toContain(">C</div>");
    expect(html).toContain("The remaining 10 points belong to checks that could not be assessed");
  });

  it("distinguishes unverified from unavailable with different chips", () => {
    expect(html).toContain('class="chip chip-unverified"');
    expect(html).toContain('class="chip chip-unavailable"');
    expect(html).toContain("marks a check Sentinel could not run");
    expect(html).toContain("marks a check that ran and then declined to read what it reached");
  });

  it("renders every category with its earned over available points", () => {
    expect(html).toContain("12 / 25 points");
    expect(html).toContain("6 / 5 points");
    expect(html).toContain("0 / 0 points");
    for (const category of report.categories) {
      expect(html).toContain(category.label);
    }
  });

  it("reports points that were not assessed", () => {
    expect(html).toContain("10 of the 15 points in this category were not assessed");
    expect(html).toContain("15 of the 15 points in this category were not assessed");
  });

  it("renders every finding with its observation and evidence", () => {
    for (const category of report.categories) {
      for (const finding of category.findings) {
        expect(html).toContain(finding.label);
      }
    }
    expect(html).toContain("https://acme-vendor.example.com/trust");
    expect(html).toContain("Acme maintains a SOC 2 Type II report available under NDA.");
    expect(html).toContain("redirected off-site to trust.thirdparty.example");
  });

  it("renders long raw evidence whole rather than trimming the report", () => {
    expect(html).toContain(LONG_CSP.replace(/'/g, "&#x27;"));
    expect(html).toContain('class="mono muted evidence-raw"');
  });

  it("marks findings worth no points as not scored rather than zero over zero", () => {
    expect(html).toContain("not scored");
  });

  it("shows the gallery and skips a capture with no image", () => {
    expect(html).toContain("data:image/jpeg;base64,AAAA");
    expect(html).toContain("/samples/acme-vendor.example.com/shot-static.jpg");
    expect(html).not.toContain("acme-vendor.example.com/legal");
  });

  it("shows the passive attack surface and the scan notes", () => {
    expect(html).toContain("137 names appear in public Certificate Transparency logs");
    expect(html).toContain("certspotter");
    expect(html).toContain("Showing 2 of them.");
    expect(html).toContain("api.acme-vendor.example.com");
    expect(html).toContain("CVE-2021-23017 (CVSS 9.4)");
    expect(html).toContain("Scan notes");
    for (const note of report.notes) expect(html).toContain(note);
  });

  it("shows engine timings including a failed engine", () => {
    expect(html).toContain("Engine A 48210ms | Engine B 31004ms (error) | total 51234ms");
  });

  it("carries no key material into the rendered markup", () => {
    expect(html).not.toMatch(/slr_live_/);
    expect(html).not.toMatch(/sk-ant-/);
  });

  it("shows an evidence URL that is not http as text rather than as a link", () => {
    const hostile: Report = {
      ...report,
      categories: [
        {
          id: "governance",
          label: "Governance and compliance",
          weight: 25,
          pointsEarned: 0,
          pointsAvailable: 0,
          pointsNotAssessed: 25,
          score: 0,
          findings: [
            {
              id: "governance.odd",
              label: "Odd evidence",
              status: "info",
              observation: "Recorded for context.",
              pointsEarned: 0,
              pointsAvailable: 0,
              evidence: { url: "javascript:alert(1)" },
            },
          ],
        },
      ],
      screenshots: [
        {
          id: "shot-odd",
          url: "https://acme-vendor.example.com/odd",
          capturedAt: "2026-08-30T09:15:40.000Z",
          source: "static",
          path: "javascript:alert(1)",
        },
        {
          id: "shot-protocol-relative",
          url: "https://acme-vendor.example.com/relative",
          capturedAt: "2026-08-30T09:15:50.000Z",
          source: "static",
          path: "//evil.example/shot.jpg",
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(ReportView, { report: hostile }));
    expect(markup).toContain("javascript:alert(1)");
    expect(markup).not.toContain('href="javascript:');
    expect(markup).not.toContain('src="javascript:');
    expect(markup).not.toContain("//evil.example/shot.jpg");
    expect(markup).not.toContain("Trust surface evidence");
  });

  it("names the model on the summary so it cannot be read as a measured finding", () => {
    expect(html).not.toContain("Executive summary");

    const narrated: Report = {
      ...report,
      executiveSummary: { text: "A neutral summary.", model: "claude-sonnet-4-6", generated: true },
    };
    const markup = renderToStaticMarkup(createElement(ReportView, { report: narrated }));
    expect(markup).toContain("Executive summary");
    expect(markup).toContain("Generated narrative from claude-sonnet-4-6");
    expect(markup).toContain("The score does not depend on it");
    expect(markup).toContain("A neutral summary.");
  });

  it("renders a Certificate Transparency outage as unavailable rather than as zero names", () => {
    const offline: Report = {
      ...report,
      subdomains: { status: "unavailable", source: "crt.sh", total: 0, sample: [], error: "timeout" },
      observedSoftware: [],
      notes: [],
      screenshots: [],
    };
    const markup = renderToStaticMarkup(createElement(ReportView, { report: offline }));
    expect(markup).toContain("Certificate Transparency lookup was unavailable for this scan.");
    expect(markup).toContain("No software product or version was disclosed");
    expect(markup).not.toContain("Scan notes");
    expect(markup).not.toContain("Trust surface evidence");
  });
});
