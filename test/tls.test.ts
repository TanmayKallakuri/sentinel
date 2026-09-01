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

describe("parseTls against the indentation openssl actually emits", () => {
  // The hand written fixture put "Protocol :" at column zero. Real openssl
  // prints it inside an indented SSL-Session block, so a parser anchored to
  // ^Protocol passes its fixture and then finds nothing against every real
  // server. This pins the real shape.
  const REAL = [
    "=== HANDSHAKE ===",
    "CONNECTED(00000003)",
    "SSL-Session:",
    "    Protocol  : TLSv1.3",
    "    Cipher    : TLS_AES_256_GCM_SHA384",
    "Verify return code: 0 (ok)",
    "=== CERT ===",
    "notBefore=Jul 28 00:00:00 2026 GMT",
    "notAfter=Nov 12 23:59:59 2026 GMT",
    "issuer=C = US, O = DigiCert Inc, CN = DigiCert Global G3 TLS ECC SHA384 2020 CA1",
    "=== TLS12 ===",
    "New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384",
    "=== TLS13 ===",
    "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384",
    "=== LEGACY ===",
    "unsupported",
  ].join("\n");

  it("reads the negotiated protocol despite the indentation", () => {
    expect(parseTls(REAL, new Date("2026-09-01T00:00:00Z")).negotiatedProtocol).toBe("TLSv1.3");
  });

  it("still reads it when a fixture leaves it unindented", () => {
    expect(parseTls(REAL.replace("    Protocol", "Protocol"), new Date()).negotiatedProtocol).toBe("TLSv1.3");
  });
});

describe("parseTls against output with no SSL-Session block", () => {
  // Captured from a real scan: feeding s_client an immediate EOF makes openssl
  // exit before printing its session summary, so "Protocol :" never appears and
  // the "New," line is the only record of what was negotiated.
  const NO_SESSION = [
    "=== HANDSHAKE ===",
    "CONNECTED(00000003)",
    "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384",
    "Verify return code: 0 (ok)",
    "=== CERT ===",
    "notAfter=Nov 12 23:59:59 2026 GMT",
    "issuer=C = US, O = DigiCert Inc",
    "=== TLS12 ===",
    "New, TLSv1.2, Cipher is ECDHE-ECDSA-AES128-GCM-SHA256",
    "=== TLS13 ===",
    "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384",
    "=== LEGACY ===",
    "supported",
  ].join("\n");

  it("falls back to the New line for the negotiated protocol", () => {
    expect(parseTls(NO_SESSION, new Date("2026-09-01T00:00:00Z")).negotiatedProtocol).toBe("TLSv1.3");
  });

  it("does not confuse the TLS12 probe section for the negotiated protocol", () => {
    expect(parseTls(NO_SESSION, new Date("2026-09-01T00:00:00Z")).tls12Supported).toBe(true);
  });
});
