import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const domain =
    typeof body === "object" && body !== null && "domain" in body && typeof body.domain === "string"
      ? body.domain
      : "";
  if (!domain) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  // Replaced by the orchestrator in Task 16.
  return NextResponse.json({ stub: true, domain });
}
