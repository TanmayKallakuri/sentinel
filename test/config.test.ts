import { describe, it, expect, afterEach } from "vitest";
import { userAgent, DEFAULT_USER_AGENT } from "@/lib/config";

describe("userAgent", () => {
  afterEach(() => {
    delete process.env.SENTINEL_USER_AGENT;
  });

  it("falls back to the honest default when unset", () => {
    expect(userAgent()).toBe(DEFAULT_USER_AGENT);
  });

  it("uses the configured value when set", () => {
    process.env.SENTINEL_USER_AGENT = "CustomBot/1.0";
    expect(userAgent()).toBe("CustomBot/1.0");
  });

  it("never presents itself as a normal browser", () => {
    expect(DEFAULT_USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/);
  });
});
