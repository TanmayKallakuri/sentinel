import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanForm } from "@/components/ScanForm";

describe("ScanForm", () => {
  it("offers the domain field when live scanning is enabled", () => {
    const html = renderToStaticMarkup(createElement(ScanForm, { enabled: true }));
    expect(html).toContain('aria-label="Vendor domain"');
    expect(html).toContain("Run scan");
  });

  it("says scanning is off and offers the samples instead of a field that would 503", () => {
    const html = renderToStaticMarkup(createElement(ScanForm, { enabled: false }));
    expect(html).toContain("Live scanning is switched off on this instance");
    expect(html).toContain("Open a sample report");
    expect(html).not.toContain('aria-label="Vendor domain"');
    expect(html).not.toContain("Run scan");
  });
});
