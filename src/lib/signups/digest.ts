/**
 * Monday, Wednesday and Friday digest of new sign-ups, emailed to the studio with a CSV
 * attached for the ResNexus import. Triggered by Vercel Cron (vercel.json).
 *
 * Each run covers the time since the previous scheduled slot, worked out from the
 * schedule itself, so a late or retried run never skips or repeats anyone and no state
 * needs to be stored. The full list is always available from the CSV export.
 */
import type { EmailSender } from '@/lib/email/resend';
import { digestEmail } from '@/lib/email/templates';
import { toCsv } from './csv';
import { isTestEmail } from './export';
import { describeError } from './log';
import type { SignupStore } from './store/types';
import type { Logger, SignupRecord } from './types';

/** Days of the week the digest runs (0 = Sunday) and the hour, in UTC. Matches vercel.json. */
export const DIGEST_DAYS = [1, 3, 5] as const;
export const DIGEST_HOUR_UTC = 8;

/** The most recent scheduled slot at or before `now`, and the one before that. */
export function digestWindow(now: Date): { since: Date; until: Date } {
  const slots: Date[] = [];
  for (let back = 0; back <= 8 && slots.length < 2; back++) {
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back, DIGEST_HOUR_UTC),
    );
    if ((DIGEST_DAYS as readonly number[]).includes(day.getUTCDay()) && day <= now) slots.push(day);
  }
  const [until, since] = slots as [Date, Date];
  return { since, until };
}

/** New, genuine sign-ups first made within [since, until). */
export function newSignups(records: readonly SignupRecord[], since: Date, until: Date): SignupRecord[] {
  return records.filter((r) => {
    const t = Date.parse(r.createdAt);
    return t >= since.getTime() && t < until.getTime() && !r.flagged && !isTestEmail(r.email);
  });
}

export interface DigestDeps {
  getStore: () => SignupStore;
  /** CRON_SECRET. Vercel Cron sends it as `Authorization: Bearer <secret>`. Unset → 404. */
  cronSecret: string | undefined;
  sender: EmailSender | null;
  to: string[];
  /** Copied in (e.g. the client). Replies go to the `to` addresses. */
  cc?: string[];
  from: string | undefined;
  siteUrl: string;
  logger: Logger;
  now?: () => Date;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleDigest(request: Request, deps: DigestDeps): Promise<Response> {
  const { logger } = deps;
  if (!deps.cronSecret) return new Response('Not found', { status: 404 });
  if (request.headers.get('authorization') !== `Bearer ${deps.cronSecret}`) {
    return json(401, { ok: false });
  }

  const now = deps.now?.() ?? new Date();
  const { since, until } = digestWindow(now);
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  let all: SignupRecord[];
  try {
    all = await deps.getStore().list();
  } catch (error) {
    logger.error('Digest: could not read sign-ups', { error: describeError(error) });
    return json(500, { ok: false });
  }

  const fresh = newSignups(all, since, until);
  const totalOnList = all.filter((r) => !r.flagged && !isTestEmail(r.email)).length;
  const summary = { since: since.toISOString(), until: until.toISOString(), count: fresh.length, totalOnList };

  if (dryRun) return json(200, { ok: true, dryRun: true, ...summary });
  if (fresh.length === 0) {
    logger.info('Digest: no new sign-ups', summary);
    return json(200, { ok: true, sent: false, ...summary });
  }
  if (!deps.sender || !deps.from || deps.to.length === 0) {
    logger.warn('Digest: email not configured (RESEND_API_KEY, SIGNUP_DIGEST_FROM, SIGNUP_DIGEST_TO)', summary);
    return json(200, { ok: true, sent: false, notConfigured: true, ...summary });
  }

  const email = digestEmail({
    records: fresh,
    since,
    until,
    totalOnList,
    exportUrl: new URL('/api/admin/signups.csv', deps.siteUrl).href,
  });
  const filename = `sea-air-club-new-signups-${until.toISOString().slice(0, 10)}.csv`;
  try {
    await deps.sender.send({
      from: deps.from,
      to: deps.to,
      cc: deps.cc,
      // The from address is a no-reply sender, so replies (e.g. from someone on cc) go to the studio.
      replyTo: deps.to[0],
      ...email,
      attachments: [{ filename, content: Buffer.from(toCsv(fresh), 'utf8').toString('base64') }],
    });
  } catch (error) {
    logger.error('Digest: email failed', { error: describeError(error), ...summary });
    return json(502, { ok: false, ...summary });
  }
  logger.info('Digest sent', summary);
  return json(200, { ok: true, sent: true, ...summary });
}
