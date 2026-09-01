import { RATE_LIMIT_GLOBAL_PER_HOUR, RATE_LIMIT_PER_IP_PER_HOUR } from "@/lib/config";

const WINDOW_MS = 3_600_000;
const MAX_TRACKED_KEYS = 1000;

/**
 * Deliberately in memory and therefore per instance. This is a demo guardrail
 * against casual abuse of a finite credit balance, not a security control: it
 * resets on redeploy and does not coordinate across serverless instances.
 */
const hits = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const kept = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (kept.length === 0) hits.delete(key);
  else hits.set(key, kept);
  return kept;
}

function oldest(list: number[]): number {
  return list.reduce((min, at) => (at < min ? at : min), Number.POSITIVE_INFINITY);
}

function retryAfter(list: number[], now: number): number {
  return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest(list))) / 1000));
}

// A caller who never comes back is never pruned by its own key, so a long lived
// instance sweeps the whole map once it has grown past a bound.
function sweep(now: number): void {
  for (const key of [...hits.keys()]) prune(key, now);
}

export function resetRateLimit(): void {
  hits.clear();
}

/** Number of buckets currently held, so the sweep above stays observable. */
export function trackedKeyCount(): number {
  return hits.size;
}

export function checkRateLimit(
  key: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; reason: string; retryAfterSeconds: number } {
  if (hits.size > MAX_TRACKED_KEYS) sweep(now);

  const callerKey = `caller:${key}`;
  const caller = prune(callerKey, now);
  const global = prune("global", now);

  if (caller.length >= RATE_LIMIT_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: `Live scans are limited to ${RATE_LIMIT_PER_IP_PER_HOUR} per hour per visitor. Sample reports are always available.`,
      retryAfterSeconds: retryAfter(caller, now),
    };
  }
  if (global.length >= RATE_LIMIT_GLOBAL_PER_HOUR) {
    return {
      allowed: false,
      reason: "This demo has reached its hourly scan budget. Sample reports are always available.",
      retryAfterSeconds: retryAfter(global, now),
    };
  }

  caller.push(now);
  global.push(now);
  hits.set(callerKey, caller);
  hits.set("global", global);
  return { allowed: true };
}
