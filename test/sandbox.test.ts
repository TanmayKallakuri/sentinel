import { describe, it, expect } from "vitest";
import { withTimeout } from "@/lib/solari/sandbox";

describe("withTimeout", () => {
  it("resolves when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "quick")).resolves.toBe("ok");
  });

  it("rejects with the label when the deadline wins", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 20, "tls")).rejects.toThrow(/tls/);
  });

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 100, "x")).rejects.toThrow("boom");
  });
});
