import { ENGINE_B_TOTAL_TIMEOUT_MS } from "@/lib/config";
import { withSandbox, withTimeout } from "@/lib/solari/sandbox";
import type { EngineBResult } from "@/lib/types";
import { checkCt } from "./ct";
import { checkDns } from "./dns";
import { checkEmailAuth } from "./email";
import { checkHeaders } from "./headers";
import { checkTech } from "./tech";
import { checkTls } from "./tls";

export async function runEngineB(domain: string): Promise<EngineBResult> {
  return withSandbox(async (runner) => {
    const work = (async (): Promise<EngineBResult> => {
      // The header check runs first because the technology fingerprint reads
      // the headers it collected rather than issuing a second request.
      const headers = await checkHeaders(runner, domain);
      const [tls, email, dns, ct, tech] = await Promise.all([
        checkTls(runner, domain),
        checkEmailAuth(runner, domain),
        checkDns(runner, domain),
        checkCt(runner, domain),
        checkTech(runner, headers, domain),
      ]);
      return { tls, headers, email, dns, ct, tech };
    })();
    return withTimeout(work, ENGINE_B_TOTAL_TIMEOUT_MS, "Engine B");
  });
}
