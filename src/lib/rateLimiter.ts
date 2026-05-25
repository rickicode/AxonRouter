const WINDOW_MS = 60_000; // 1 minute
const OPEN_MODE_LIMIT = 200;
const DEFAULT_KEY_LIMIT = 600;

type BucketEntry = { count: number; windowStart: number };

const buckets = new Map<string, BucketEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now - entry.windowStart > WINDOW_MS) buckets.delete(key);
    }
  }, 60_000);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function checkRateLimit(identifier: string, limit: number): { allowed: boolean; remaining: number; resetMs: number } {
  // 0 = unlimited
  if (limit <= 0) return { allowed: true, remaining: -1, resetMs: 0 };
  startCleanup();
  const now = Date.now();
  const entry = buckets.get(identifier);
  
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    buckets.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetMs: WINDOW_MS };
  }
  
  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const resetMs = WINDOW_MS - (now - entry.windowStart);
  
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetMs };
  }
  
  return { allowed: true, remaining, resetMs };
}

export function getRateLimitHeaders(result: { remaining: number; resetMs: number }, limit: number) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.resetMs) / 1000)),
  };
}

export const OPEN_MODE_LIMIT_PER_MIN = OPEN_MODE_LIMIT;
export const DEFAULT_KEY_LIMIT_PER_MIN = DEFAULT_KEY_LIMIT;
