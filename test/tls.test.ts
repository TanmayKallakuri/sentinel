import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTls } from "@/lib/engine-b/tls";

const FIXTURE = readFileSync(path.join(__dirname, "fixtures/openssl-output.txt"), "utf8");

describe("parseTls", () => {
  const result = parseTls(FIXTURE, new Date("2026-03-01T00:00:00Z"));

  it("records the negotiated protocol", () => {
    expect(result.negotiatedProtocol).toBe("TLSv1.3");
  });

  it("records support for TLS 1.2 and 1.3", () => {
    expect(result.tls13Supported).toBe(true);
    expect(result.tls12Supported).toBe(true);
  });

  it("marks the chain valid on verify return code 0", () => {
    expect(result.chainValid).toBe(true);
    expect(result.verifyMessage).toContain("0 (ok)");
  });

  it("extracts the issuer and validity window", () => {
    expect(result.issuer).toContain("Let's Encrypt");
    expect(result.notAfter).toBe("Apr  1 00:00:00 2026 GMT");
  });

  it("computes days to expiry against the supplied clock", () => {
    expect(result.daysToExpiry).toBe(31);
  });

  it("reports legacy protocol testing as not available", () => {
    expect(result.legacyProtocolsTestable).toBe(false);
  });

  it("parses a transcript with CRLF line endings", () => {
    const crlf = parseTls(FIXTURE.replace(/\n/g, "\r\n"), new Date("2026-03-01T00:00:00Z"));
    expect(crlf.negotiatedProtocol).toBe("TLSv1.3");
    expect(crlf.daysToExpiry).toBe(31);
  });

  it("returns unavailable when the handshake produced nothing", () => {
    const empty = parseTls("=== HANDSHAKE ===\n=== CERT ===\n", new Date());
    expect(empty.status).toBe("unavailable");
  });
});
