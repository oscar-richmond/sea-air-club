/**
 * Best-effort, in-memory rate limiter (sliding window, per key).
 *
 * Each serverless instance keeps its own counts and loses them on a cold start, so this
 * only slows down a single noisy client. Production should also have a Vercel Firewall
 * rate-limit rule on /api/subscribe (see docs/SIGNUPS.md).
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window after this one. */
  remaining: number;
  /** Seconds until another attempt is allowed (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Record an attempt for `key` and say whether it's allowed. */
  hit(key: string): RateLimitResult;
  /** Check without recording an attempt. */
  peek(key: string): RateLimitResult;
  reset(): void;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Cap on tracked keys, so memory can't grow without bound. */
  maxKeys?: number;
  now?: () => number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();

  function recent(key: string, at: number): number[] {
    const list = hits.get(key);
    if (!list) return [];
    const fresh = list.filter((t) => at - t < windowMs);
    if (fresh.length === 0) hits.delete(key);
    else if (fresh.length !== list.length) hits.set(key, fresh);
    return fresh;
  }

  function sweep(at: number) {
    for (const key of hits.keys()) recent(key, at);
    // Still too many? Drop the oldest keys (Map keeps insertion order).
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  // Blocked attempts aren't recorded, so a list never holds more than `limit` entries
  // and a slot frees up when its oldest entry leaves the window.
  function blocked(list: number[], at: number): RateLimitResult {
    const waitMs = windowMs - (at - (list[0] ?? at));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  return {
    hit(key) {
      const at = now();
      const list = recent(key, at);
      if (list.length >= limit) return blocked(list, at);
      if (!hits.has(key) && hits.size >= maxKeys) sweep(at);
      const next = [...list, at];
      hits.set(key, next);
      return { allowed: true, remaining: limit - next.length, retryAfterSeconds: 0 };
    },
    peek(key) {
      const at = now();
      const list = recent(key, at);
      if (list.length >= limit) return blocked(list, at);
      return { allowed: true, remaining: limit - list.length, retryAfterSeconds: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * The client's IP: first `x-forwarded-for` entry (set by Vercel), else `x-real-ip`,
 * else the address the server saw. Used only as a rate-limit key, never stored.
 */
export function getClientIp(headers: Headers, fallback?: string | null): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return fallback?.trim() || 'unknown';
}
