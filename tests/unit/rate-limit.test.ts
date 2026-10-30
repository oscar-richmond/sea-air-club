import { describe, expect, it } from 'vitest';
import { createRateLimiter, getClientIp } from '../../src/lib/signups/rate-limit';
import { SUBSCRIBE_RATE_LIMIT } from '../../src/lib/signups/subscribe';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('createRateLimiter', () => {
  it('allows 5 attempts per 10 minutes for sign-ups, then blocks', () => {
    const c = clock();
    const limiter = createRateLimiter({ ...SUBSCRIBE_RATE_LIMIT, now: c.now });
    for (let i = 0; i < 5; i++) {
      const r = limiter.hit('203.0.113.7');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const blocked = limiter.hit('203.0.113.7');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(600);
  });

  it('keeps keys separate', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('frees a slot when the oldest attempt leaves the window (sliding window)', () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: c.now });
    limiter.hit('ip');
    c.advance(4_000);
    limiter.hit('ip');
    c.advance(1_000);
    const blocked = limiter.hit('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(5);
    c.advance(5_000);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(false);
  });

  it('does not count blocked attempts or peeks', () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: c.now });
    expect(limiter.peek('ip').allowed).toBe(true);
    limiter.hit('ip');
    for (let i = 0; i < 5; i++) limiter.hit('ip');
    c.advance(10_000);
    expect(limiter.hit('ip').allowed).toBe(true);
  });

  it('caps memory by evicting the oldest keys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const key of ['a', 'b', 'c', 'd']) limiter.hit(key);
    // 'a' was evicted to make room, so it gets a fresh allowance.
    expect(limiter.hit('a').allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'x-real-ip': '10.0.0.2' });
    expect(getClientIp(h)).toBe('198.51.100.1');
  });

  it('falls back to x-real-ip, then the server-seen address, then "unknown"', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(getClientIp(new Headers(), '::1')).toBe('::1');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
