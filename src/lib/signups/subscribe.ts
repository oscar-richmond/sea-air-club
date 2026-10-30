import { FIELD, REDIRECT, type SubscribeResponse } from './contract';
import {
  getBodyKind,
  isAllowedOrigin,
  jsonResponse,
  readSubmission,
  redirectResponse,
  wantsJson,
} from './http';
import { describeError, maskEmail } from './log';
import { createRateLimiter, getClientIp, type RateLimiter } from './rate-limit';
import { containsLink, detectSpam } from './spam';
import type { SignupStore } from './store/types';
import type { Logger } from './types';
import { cleanFirstName, LIMITS, parseSubmission } from './validation';
import { sendWebhook, type WebhookSettings } from './webhook';

export type SubscribeErrorCode = 'validation' | 'rate_limited' | 'server';

/**
 * 30 attempts per 10 minutes per IP, per server instance. Generous on purpose: people share
 * addresses on venue Wi-Fi and mobile networks. A Vercel Firewall rule is the real control.
 */
export const SUBSCRIBE_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 } as const;

export function createSubscribeRateLimiter(): RateLimiter {
  return createRateLimiter(SUBSCRIBE_RATE_LIMIT);
}

export interface SubscribeDeps {
  /** The store, created on first use (so a misconfigured store becomes a 500, not a crash). */
  getStore: () => SignupStore;
  rateLimiter: RateLimiter;
  webhook: WebhookSettings;
  logger: Logger;
  /** Accept `Origin: http://localhost:*` (local development only). */
  allowLocalhostOrigin: boolean;
  /** Fallback client address when there are no proxy headers. */
  clientAddress?: string | null;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Where the no-JavaScript form goes next. No personal data ever goes in these URLs. */
export function failureLocation(code: SubscribeErrorCode): string {
  // The fragment shows the error message on /join even without JavaScript (CSS :target).
  return `${REDIRECT.failure}?error=${code}#signup-error-${code}`;
}

const STATUS: Record<SubscribeErrorCode, number> = {
  validation: 400,
  rate_limited: 429,
  server: 500,
};

function respond(
  asJson: boolean,
  body: SubscribeResponse,
  options: { status?: number; headers?: Record<string, string> } = {},
): Response {
  if (asJson) {
    const status = options.status ?? (body.ok ? 200 : STATUS[body.error]);
    return jsonResponse(body, status, options.headers);
  }
  return redirectResponse(
    body.ok ? REDIRECT.success : failureLocation(body.error),
    options.headers,
  );
}

/** The name to echo back on a silent drop, so it looks exactly like a real success. */
function echoName(raw: unknown): string | null {
  if (typeof raw !== 'string' || containsLink(raw)) return null;
  const cleaned = cleanFirstName(raw);
  return cleaned && cleaned.length <= LIMITS.firstName ? cleaned : null;
}

/**
 * POST /api/subscribe. Order: origin check → rate limit → read body → spam checks
 * (silent) → validation → store → webhook → respond.
 */
export async function handleSubscribe(request: Request, deps: SubscribeDeps): Promise<Response> {
  const { logger } = deps;
  const now = deps.now ?? (() => new Date());

  if (!isAllowedOrigin(request, { allowLocalhost: deps.allowLocalhostOrigin })) {
    logger.warn('Refused a cross-site sign-up', { origin: request.headers.get('origin') });
    return jsonResponse({ ok: false, error: 'server' } satisfies SubscribeResponse, 403);
  }

  // Decided from the headers alone, so even early refusals answer in kind.
  const asJson = wantsJson(request, getBodyKind(request.headers.get('content-type')));

  const ip = getClientIp(request.headers, deps.clientAddress);
  const limit = deps.rateLimiter.hit(ip);
  if (!limit.allowed) {
    logger.warn('Rate limited a sign-up attempt');
    return respond(
      asJson,
      { ok: false, error: 'rate_limited' },
      { headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = await readSubmission(request);
  if (!body.ok) {
    return respond(asJson, { ok: false, error: 'validation', fieldErrors: {} }, { status: 413 });
  }
  const raw = body.raw;

  const spam = detectSpam(raw);

  const parsed = parseSubmission(raw);
  if (!parsed.ok) {
    if (spam) {
      // Bot with an unusable address: nothing worth keeping, and don't tell it why.
      logger.info('Dropped a spam sign-up', { reason: spam });
      return respond(asJson, {
        ok: true,
        firstName: echoName(raw[FIELD.firstName]),
        alreadySubscribed: false,
      });
    }
    return respond(asJson, { ok: false, error: 'validation', fieldErrors: parsed.fieldErrors });
  }
  const input = { ...parsed.input, flagged: spam };
  // A link in the name field is a spam signal, but people also type their email there by
  // mistake. Keep the sign-up, drop the name.
  if (input.firstName && containsLink(input.firstName)) input.firstName = null;

  let result;
  try {
    result = await deps.getStore().upsert(input, now());
  } catch (error) {
    logger.error('Could not save a sign-up', {
      email: maskEmail(input.email),
      error: describeError(error),
    });
    return respond(asJson, { ok: false, error: 'server' });
  }

  logger.info(result.created ? 'New sign-up' : 'Repeat sign-up', {
    email: maskEmail(input.email),
    submissions: result.record.submissions,
    ...(spam ? { flagged: spam } : {}),
  });

  if (!result.record.flagged) await sendWebhook(
    { event: result.created ? 'signup.created' : 'signup.updated', signup: result.record },
    deps.webhook,
    { logger, ...(deps.fetch ? { fetch: deps.fetch } : {}) },
  );

  // Echo only the name typed in this submission. Returning the stored name would tell
  // anyone who types a known email address that person's first name.
  return respond(asJson, {
    ok: true,
    firstName: input.firstName,
    alreadySubscribed: !result.created,
  });
}
