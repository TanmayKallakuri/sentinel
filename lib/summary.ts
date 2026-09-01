import Anthropic from "@anthropic-ai/sdk";
import type { Report } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 1024;

const RULES = [
  "Rules:",
  "- The report above is the only information you have. Summarise what is in it and introduce no new facts, no industry context, and nothing you know about this vendor from anywhere else.",
  "- Every finding is an observation of public data, not a test of a control. Do not claim or imply that the vendor is vulnerable, insecure, exposed, at risk, or breached.",
  "- A finding marked unavailable means the check could not run. A finding marked unverified means the check ran and deliberately did not read what it reached. Neither is a failure and neither may be reported as one.",
  "- Absence of a signal means nothing was found at the locations listed in the evidence, not that the vendor lacks the control. Say it that way.",
  "- Write for a non specialist procurement reader in three short paragraphs: what was observed, what was not observed, and what to ask the vendor.",
  "- Plain prose. No headings, no bullet points, no markdown, no emojis.",
].join("\n");

export function buildSummaryPrompt(report: Report): string {
  // screenshots carry base64 image data and public file paths, neither of which
  // the model can read, so they are dropped rather than sent.
  const { screenshots, ...body } = report;
  void screenshots;

  return [
    `Below is a complete passive security posture report for ${report.domain}, as JSON.`,
    "",
    "<report>",
    JSON.stringify(body, null, 2),
    "</report>",
    "",
    RULES,
  ].join("\n");
}

/**
 * Narrative only. The score is computed and final before this runs, so an
 * absent key, a failed call, or an empty answer degrades to no summary rather
 * than to a different report.
 */
export async function maybeSummarize(report: Report): Promise<Report> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return report;

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: buildSummaryPrompt(report) }],
    });
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!text) return report;
    return { ...report, executiveSummary: { text, model: MODEL, generated: true } };
  } catch {
    return report;
  }
}
