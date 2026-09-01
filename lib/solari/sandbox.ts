import { SandboxClient } from "@solarisdk/sandbox";
import {
  CHECK_TIMEOUT_MS,
  SANDBOX_CPU,
  SANDBOX_MEM_MB,
  SANDBOX_TIMEOUT_MS,
} from "@/lib/config";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxRunner {
  run(script: string, args: string[], timeoutMs?: number): Promise<CommandResult>;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * One sandbox per scan, killed unconditionally. timeoutMs is a rolling idle
 * window that resets on every use rather than a hard deadline, so it is a
 * backstop and not a substitute for the per command timeouts below. The
 * lifecycle is set to kill on that timeout so a crashed orchestrator cannot
 * leave a machine running and quietly burn credits. kill() destroys the remote
 * VM; close() alone would only drop the local control channel.
 */
export async function withSandbox<T>(fn: (runner: SandboxRunner) => Promise<T>): Promise<T> {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) throw new Error("SOLARI_API_KEY is not set");

  const sandboxes = new SandboxClient({ apiKey, baseUrl: "https://api.getsolari.com" });
  const sbx = await sandboxes.create({
    template: "base",
    cpu: SANDBOX_CPU,
    memMb: SANDBOX_MEM_MB,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    lifecycle: { onTimeout: "kill" },
  });

  try {
    await sbx.connect();
    const runner: SandboxRunner = {
      async run(script, args, timeoutMs = CHECK_TIMEOUT_MS) {
        // "sh -c script sentinel arg1 arg2" sets $0 to sentinel and $1 onward
        // to the arguments, so no target value is ever interpolated into the
        // script text.
        const result = await withTimeout(
          sbx.commands.run("sh", { args: ["-c", script, "sentinel", ...args] }),
          timeoutMs,
          "sandbox command",
        );
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      },
    };
    return await fn(runner);
  } finally {
    // A failed teardown is the one error worth surfacing here: the VM outlives
    // the scan and bills until its idle timeout.
    await sbx.kill().catch(() => {
      console.warn(`sandbox ${sbx.sandboxId} could not be killed; check the Solari console`);
    });
  }
}
