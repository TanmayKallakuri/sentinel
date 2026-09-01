import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit, trackedKeyCount } from "@/lib/rate-limit";
import { RATE_LIMIT_PER_IP_PER_HOUR, RATE_LIMIT_GLOBAL_PER_HOUR } from "@/lib/config";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimit());

  it("allows up to the per caller hourly cap", () => {
    for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) {
      expect(checkRateLimit("1.1.1.1").allowed).toBe(true);
    }
    const blocked = checkRateLimit("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks callers independently", () => {
    for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) checkRateLimit("1.1.1.1");
    expect(checkRateLimit("2.2.2.2").allowed).toBe(true);
  });

  it("enforces a global cap that protects the credit balance", () => {
    let allowed = 0;
    for (let caller = 0; caller < 50; caller += 1) {
      for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) {
        if (checkRateLimit(`caller-${caller}`).allowed) allowed += 1;
      }
    }
    expect(allowed).toBe(RATE_LIMIT_GLOBAL_PER_HOUR);
  });

  it("forgets entries older than the window", () => {
    const start = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) checkRateLimit("1.1.1.1", start);
    expect(checkRateLimit("1.1.1.1", start).allowed).toBe(false);
    expect(checkRateLimit("1.1.1.1", start + 3_600_001).allowed).toBe(true);
  });

  it("does not let one caller's key collide with the global bucket", () => {
    for (let i = 0; i < RATE_LIMIT_GLOBAL_PER_HOUR; i += 1) checkRateLimit(`caller-${i}`);
    const blocked = checkRateLimit("fresh-caller");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toMatch(/hourly scan budget/);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("treats an empty caller key as one bucket rather than throwing", () => {
    for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) {
      expect(checkRateLimit("").allowed).toBe(true);
    }
    expect(checkRateLimit("").allowed).toBe(false);
  });

  it("does not grow its map without bound as callers come and go", () => {
    let now = 5_000_000;
    for (let hour = 0; hour < 200; hour += 1) {
      now += 3_600_001;
      for (let caller = 0; caller < 20; caller += 1) {
        checkRateLimit(`hour-${hour}-caller-${caller}`, now);
      }
    }
    // Four thousand distinct callers were seen. Only the last hour is still live.
    expect(trackedKeyCount()).toBeLessThanOrEqual(1002);
    expect(checkRateLimit("one-more", now).allowed).toBe(false);
    expect(checkRateLimit("one-more", now + 3_600_001).allowed).toBe(true);
  });

  it("counts a refused attempt against neither bucket", () => {
    const start = 2_000_000;
    for (let i = 0; i < RATE_LIMIT_PER_IP_PER_HOUR; i += 1) checkRateLimit("1.1.1.1", start);
    for (let i = 0; i < 10; i += 1) checkRateLimit("1.1.1.1", start + 1000);
    // The blocked attempts must not extend the window or consume global budget.
    expect(checkRateLimit("2.2.2.2", start + 1000).allowed).toBe(true);
    expect(checkRateLimit("1.1.1.1", start + 3_600_001).allowed).toBe(true);
  });
});
