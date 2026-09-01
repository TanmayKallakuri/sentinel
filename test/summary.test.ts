import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fixtureReport as report } from "./fixtures/report";

// The SDK is stubbed for every test in this file. Nothing here may reach the
// network or spend a token.
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { buildSummaryPrompt, maybeSummarize } = await import("@/lib/summary");

const previous = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  create.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previous;
});

describe("buildSummaryPrompt", () => {
  const prompt = buildSummaryPrompt(report);

  it("carries the deterministic score, the assessed denominator, and the grade", () => {
    expect(prompt).toContain('"overallScore": 71.1');
    expect(prompt).toContain('"assessedPoints": 90');
    expect(prompt).toContain('"grade": "C"');
  });

  it("carries every finding label and status so the model has nothing to invent", () => {
    for (const category of report.categories) {
      expect(prompt).toContain(category.label);
      for (const finding of category.findings) {
        expect(prompt).toContain(finding.label);
        expect(prompt).toContain(finding.observation);
      }
    }
    expect(prompt).toContain('"status": "unverified"');
    expect(prompt).toContain('"status": "unavailable"');
  });

  it("forbids new claims and forbids calling the vendor vulnerable", () => {
    expect(prompt).toContain("introduce no new facts");
    expect(prompt).toContain(
      "Do not claim or imply that the vendor is vulnerable, insecure, exposed, at risk, or breached.",
    );
    expect(prompt).toContain("non specialist procurement reader");
  });

  it("explains that unavailable and unverified are not failures", () => {
    expect(prompt).toContain("Neither is a failure and neither may be reported as one.");
  });

  it("sends the report and nothing else, minus the unreadable screenshots", () => {
    const json = prompt.slice(prompt.indexOf("<report>") + 8, prompt.indexOf("</report>"));
    expect(JSON.parse(json)).toEqual({ ...report, screenshots: undefined });
    expect(prompt).not.toContain("data:image/jpeg;base64");
    expect(prompt).not.toContain("shot-static.jpg");
  });

  it("stays a prompt when the report is empty rather than throwing", () => {
    const empty = { ...report, categories: [], notes: [], observedSoftware: [] };
    expect(buildSummaryPrompt(empty).length).toBeGreaterThan(0);
  });
});

describe("maybeSummarize", () => {
  it("returns the report unchanged when no key is configured", async () => {
    await expect(maybeSummarize(report)).resolves.toEqual(report);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the report unchanged when the key is blank or whitespace", async () => {
    for (const value of ["", "   "]) {
      process.env.ANTHROPIC_API_KEY = value;
      await expect(maybeSummarize(report)).resolves.toEqual(report);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("attaches the narrative without touching the score when the call succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockResolvedValue({ content: [{ type: "text", text: "  A neutral summary.  " }] });

    const result = await maybeSummarize(report);
    expect(result.executiveSummary).toEqual({
      text: "A neutral summary.",
      model: "claude-sonnet-4-6",
      generated: true,
    });
    expect(result.overallScore).toBe(report.overallScore);
    expect(result.grade).toBe(report.grade);
    expect(result.assessedPoints).toBe(report.assessedPoints);
    expect(result.categories).toEqual(report.categories);

    const call = create.mock.calls[0]?.[0];
    expect(call).toMatchObject({ model: "claude-sonnet-4-6" });
    expect(call.messages).toEqual([{ role: "user", content: buildSummaryPrompt(report) }]);
  });

  it("ignores blocks that are not text", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "unused" },
        { type: "text", text: "Kept." },
      ],
    });
    expect((await maybeSummarize(report)).executiveSummary?.text).toBe("Kept.");
  });

  it("returns the report unchanged when the call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockRejectedValue(new Error("overloaded"));
    await expect(maybeSummarize(report)).resolves.toEqual(report);
  });

  it("returns the report unchanged when the answer is empty or has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    for (const content of [[], [{ type: "text", text: "   " }], [{ type: "tool_use" }]]) {
      create.mockResolvedValue({ content });
      const result = await maybeSummarize(report);
      expect(result).toEqual(report);
      expect(result.executiveSummary).toBeUndefined();
    }
  });

  it("never mutates the report it was given", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockResolvedValue({ content: [{ type: "text", text: "A neutral summary." }] });
    const before = JSON.stringify(report);
    await maybeSummarize(report);
    expect(JSON.stringify(report)).toBe(before);
    expect(report.executiveSummary).toBeUndefined();
  });
});
