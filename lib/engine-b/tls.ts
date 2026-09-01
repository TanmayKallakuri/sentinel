import type { SandboxRunner } from "@/lib/solari/sandbox";
import type { TlsResult } from "@/lib/types";

/**
 * A standard handshake to port 443 and nothing else. The legacy section only
 * reports whether this OpenSSL build can even negotiate TLS 1.0, because a
 * failure on a build without legacy support proves nothing about the server.
 */
export const TLS_SCRIPT = `
set -u
D="$1"
echo "=== HANDSHAKE ==="
echo | timeout 15 openssl s_client -connect "$D:443" -servername "$D" 2>&1 | tee /tmp/hs.txt
echo "=== CERT ==="
openssl x509 -noout -dates -issuer -subject -in /tmp/hs.txt 2>/dev/null || echo "no certificate parsed"
echo "=== TLS12 ==="
echo | timeout 10 openssl s_client -connect "$D:443" -servername "$D" -tls1_2 2>&1 | grep -E "^New," || echo "not negotiated"
echo "=== TLS13 ==="
echo | timeout 10 openssl s_client -connect "$D:443" -servername "$D" -tls1_3 2>&1 | grep -E "^New," || echo "not negotiated"
echo "=== LEGACY ==="
if openssl s_client -help 2>&1 | grep -q -- "-tls1 "; then echo "supported"; else echo "unsupported"; fi
`;

function section(stdout: string, name: string): string {
  // Tolerates CRLF so a transcript captured or checked out on Windows splits
  // the same way as one read straight off the sandbox.
  const pattern = new RegExp(`=== ${name} ===\\r?\\n([\\s\\S]*?)(?:\\r?\\n=== |$)`);
  return pattern.exec(stdout)?.[1] ?? "";
}

export function parseTls(stdout: string, now: Date): TlsResult {
  const handshake = section(stdout, "HANDSHAKE");
  const cert = section(stdout, "CERT");
  const legacyTestable = section(stdout, "LEGACY").trim() === "supported";

  // Because the script feeds s_client an immediate EOF, openssl exits before it
  // prints its SSL-Session summary, so the "Protocol :" line this once parsed is
  // absent from real output. The "New, TLSv1.3, Cipher is ..." line is what is
  // actually emitted. The SSL-Session form is still tried first, since some
  // builds and invocations do print it.
  const negotiatedProtocol =
    /^\s*Protocol\s*:\s*(\S+)/m.exec(handshake)?.[1]
    ?? /^New,\s*(TLSv[\d.]+)/m.exec(handshake)?.[1];
  const verifyMessage = /Verify return code:\s*(.+)$/m.exec(handshake)?.[1]?.trim();
  const notBefore = /notBefore=(.+)$/m.exec(cert)?.[1]?.trim();
  const notAfter = /notAfter=(.+)$/m.exec(cert)?.[1]?.trim();
  const issuer = /issuer=(.+)$/m.exec(cert)?.[1]?.trim();

  if (!negotiatedProtocol && !notAfter) {
    return {
      status: "unavailable",
      legacyProtocolsTestable: legacyTestable,
      error: "No TLS handshake data was returned.",
      raw: stdout.slice(0, 4_000),
    };
  }

  const expiry = notAfter ? new Date(notAfter) : undefined;
  const daysToExpiry =
    expiry && !Number.isNaN(expiry.getTime())
      ? Math.floor((expiry.getTime() - now.getTime()) / 86_400_000)
      : undefined;

  return {
    status: "info",
    negotiatedProtocol,
    tls12Supported: /^New,\s*TLSv1\.2/m.test(section(stdout, "TLS12")),
    tls13Supported: /^New,\s*TLSv1\.3/m.test(section(stdout, "TLS13")),
    legacyProtocolsTestable: legacyTestable,
    chainValid: verifyMessage?.startsWith("0") ?? undefined,
    verifyMessage,
    issuer,
    notBefore,
    notAfter,
    daysToExpiry,
    raw: stdout.slice(0, 4_000),
  };
}

export async function checkTls(runner: SandboxRunner, domain: string): Promise<TlsResult> {
  try {
    const result = await runner.run(TLS_SCRIPT, [domain]);
    return parseTls(result.stdout, new Date());
  } catch (error) {
    return {
      status: "unavailable",
      legacyProtocolsTestable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
