import { FIELD } from './contract';
import type { RawSubmission } from './validation';

/**
 * Submissions faster than this (from the form being shown) are flagged as likely bots.
 * Kept low so browser autofill (which can complete the form in about a second) isn't caught.
 */
export const MIN_ELAPSED_MS = 800;

export type SpamReason = 'honeypot' | 'too_fast';

/**
 * Spam checks. A hit is never thrown away: the sender is told it worked (bots learn
 * nothing), the sign-up is stored with a `flagged` reason, no webhook fires, and the CSV
 * export leaves it out unless asked. So a real person caught by mistake can be recovered.
 */
export function detectSpam(raw: RawSubmission): SpamReason | null {
  // Honeypot: hidden from people, so anything in it came from a bot.
  const honeypot = raw[FIELD.honeypot];
  if (typeof honeypot === 'string' ? honeypot.trim() !== '' : honeypot != null) {
    return 'honeypot';
  }

  // Timing: only when the browser script sent it. The no-JavaScript form doesn't.
  const elapsed = raw[FIELD.elapsedMs];
  if (elapsed !== undefined && elapsed !== null && elapsed !== '') {
    const ms = typeof elapsed === 'number' ? elapsed : Number(String(elapsed).trim());
    if (!Number.isFinite(ms) || ms < MIN_ELAPSED_MS) return 'too_fast';
  }

  return null;
}

/** Links in the first name are a spam signal; the name is dropped but the sign-up is kept. */
const LINK_PATTERN =
  /http|www\.|:\/\/|\b[a-z0-9-]+\.(?:com|net|org|info|biz|ru|cn|xyz|top|io|co|uk|online|site|link|click|shop)\b/i;

export function containsLink(value: string): boolean {
  return LINK_PATTERN.test(value);
}
