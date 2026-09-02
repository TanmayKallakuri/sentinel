import { NextRequest, NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/domain";
import {
  LIVE_SCANS_DISABLED_MESSAGE,
  SAMPLES_PATH,
  liveScansEnabled,
} from "@/lib/live-scans";
import { runScan } from "@/lib/orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Measured full scans land at 9 to 28 seconds, so 60 leaves better than double
// headroom while still failing fast if a target hangs rather than holding a
// function open for five minutes.
export const maxDuration = 60;

const MAX_BODY_BYTES = 4096;
// Token shapes that must never travel back to a caller, whatever an SDK error says.
const SECRET_SHAPES = /\b(slr_[a-z0-9_]+|sk-ant-[a-zA-Z0-9_-]+)\b/g;

function callerKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const redacted = raw.replace(SECRET_SHAPES, "[redacted]").trim();
  if (!redacted) return "The scan could not be completed.";
  return redacted.length > 300 ? `${redacted.slice(0, 300)}...` : redacted;
}

export async function POST(request: NextRequest) {
  // First, ahead of the rate limiter and of reading the body at all, so a
  // switched off instance can never reach the code that constructs a Solari
  // client and therefore can never spend a credit.
  if (!liveScansEnabled()) {
    return NextResponse.json(
      { error: LIVE_SCANS_DISABLED_MESSAGE, samples: SAMPLES_PATH },
      { status: 503 },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body: unknown = await request.json().catch(() => null);
  const raw =
    typeof body === "object" && body !== null && "domain" in body && typeof body.domain === "string"
      ? body.domain
      : "";

  // Validated before the rate limiter so a typo never costs the caller a scan.
  const validated = normalizeDomain(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 400 });
  }

  const limit = checkRateLimit(callerKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    return NextResponse.json(await runScan(validated.domain));
  } catch (error) {
    // The message is surfaced but never the key or the stack.
    return NextResponse.json({ error: safeMessage(error) }, { status: 502 });
  }
}
