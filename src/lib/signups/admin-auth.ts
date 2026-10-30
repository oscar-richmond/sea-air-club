import { createHash, timingSafeEqual } from 'node:crypto';

export const ADMIN_USER = 'admin';
export const ADMIN_REALM = 'Sea Air Club';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** Read `Authorization: Basic …` into a user and password, or null if it isn't one. */
export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header.trim());
  if (!match?.[1]) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * True only for user `admin` with the right password. The user and password are both
 * checked, in constant time, and an empty configured password never matches.
 */
export function isAuthorised(header: string | null, expectedPassword: string | undefined): boolean {
  if (!expectedPassword) return false;
  const creds = parseBasicAuth(header);
  // Still do a comparison when the header is missing, so timing doesn't reveal much.
  const given = creds ? `${creds.user}:${creds.password}` : '';
  return safeEqual(given, `${ADMIN_USER}:${expectedPassword}`) && creds !== null;
}
