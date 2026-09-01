import { describe, it, expect } from "vitest";
import { toScreenshot } from "@/lib/screenshots";
import { MAX_SCREENSHOT_BYTES } from "@/lib/config";

describe("toScreenshot", () => {
  it("wraps a small buffer as an inline jpeg data url", () => {
    const shot = toScreenshot(Buffer.from([1, 2, 3]), "https://acme.com/", "shot-1");
    expect(shot?.source).toBe("inline");
    expect(shot?.dataUrl?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(shot?.url).toBe("https://acme.com/");
    expect(shot?.id).toBe("shot-1");
  });

  it("returns null for a buffer over the inline cap so the report stays small", () => {
    expect(toScreenshot(Buffer.alloc(MAX_SCREENSHOT_BYTES + 1), "https://acme.com/", "shot-2")).toBeNull();
  });

  it("accepts a buffer exactly at the cap, pinning the boundary", () => {
    expect(toScreenshot(Buffer.alloc(MAX_SCREENSHOT_BYTES), "https://acme.com/", "shot-3")).not.toBeNull();
  });

  it("stamps an ISO capture time", () => {
    expect(toScreenshot(Buffer.from([1]), "https://acme.com/", "shot-4")?.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
