import { FIELD } from './contract';
import type { RawSubmission } from './validation';

/** Submissions faster than this (from the form being shown) are treated as bots. */
export const MIN_ELAPSED_MS = 1500;

export type SpamReason = 'honeypot' | 'too_fast' | 'link_in_name';

/**
 * Spam checks. A hit is dropped silently: the sender is told it worked, nothing is
 * stored and no webhook fires, so bots learn nothing.
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

  // People don't put links in their first name; spam bots do.
  const firstName = raw[FIELD.firstName];
  if (typeof firstName === 'string' && containsLink(firstName)) return 'link_in_name';

  return null;
}

const LINK_PATTERN =
  /http|www\.|:\/\/|\b[a-z0-9-]+\.(?:com|net|org|info|biz|ru|cn|xyz|top|io|co|uk|online|site|link|click|shop)\b/i;

export function containsLink(value: string): boolean {
  return LINK_PATTERN.test(value);
}
