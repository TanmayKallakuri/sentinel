import { describe, it, expect } from "vitest";
import { parseHeaders, TRACKED_HEADERS } from "@/lib/engine-b/headers";

const REDIRECT_THEN_OK = `HTTP/2 301
location: https://www.acme.com/
server: nginx

HTTP/2 200
server: nginx/1.24.0
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: default-src 'self'
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
`;

describe("parseHeaders", () => {
  const result = parseHeaders(REDIRECT_THEN_OK);

  it("reads the final response, not the redirect", () => {
    expect(result.httpStatus).toBe(200);
    expect(result.headers["server"]).toBe("nginx/1.24.0");
  });

  it("records present tracked headers with their values", () => {
    expect(result.headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(result.headers["content-security-policy"]).toBe("default-src 'self'");
  });

  it("records absent tracked headers as null rather than omitting them", () => {
    expect(result.headers["x-frame-options"]).toBeNull();
    expect(result.headers["permissions-policy"]).toBeNull();
  });

  it("includes an entry for every tracked header", () => {
    for (const header of TRACKED_HEADERS) {
      expect(header in result.headers).toBe(true);
    }
  });

  it("reads a transcript with CRLF line endings", () => {
    const crlf = parseHeaders(REDIRECT_THEN_OK.replace(/\n/g, "\r\n"));
    expect(crlf.httpStatus).toBe(200);
    expect(crlf.headers["server"]).toBe("nginx/1.24.0");
  });

  it("returns unavailable on empty output", () => {
    expect(parseHeaders("").status).toBe("unavailable");
  });
});
