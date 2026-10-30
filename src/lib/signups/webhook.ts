import { createHmac } from 'node:crypto';
import { describeError, maskEmail } from './log';
import type { Logger, SignupRecord } from './types';

export type WebhookEvent = 'signup.created' | 'signup.updated';

export interface WebhookPayload {
  event: WebhookEvent;
  signup: SignupRecord;
}

export interface WebhookSettings {
  /** SIGNUP_WEBHOOK_URL. Nothing is sent if unset. */
  url?: string | undefined;
  /** SIGNUP_WEBHOOK_SECRET. Adds an `X-Signature` header when set. */
  secret?: string | undefined;
}

export const WEBHOOK_TIMEOUT_MS = 3000;

/** `sha256=<hex>`: HMAC-SHA256 of the exact request body, keyed with the shared secret. */
export function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/**
 * POST the sign-up to the webhook, if one is configured. Never throws: failures are
 * logged, and the visitor's sign-up has already been saved by the time this runs.
 * Returns true if the webhook answered with a 2xx.
 */
export async function sendWebhook(
  payload: WebhookPayload,
  settings: WebhookSettings,
  deps: { fetch?: typeof fetch; logger: Logger; timeoutMs?: number },
): Promise<boolean> {
  if (!settings.url) return false;
  const doFetch = deps.fetch ?? fetch;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'SeaAirClub-Signups/1.0',
    'X-Signup-Event': payload.event,
  };
  if (settings.secret) headers['X-Signature'] = signWebhookBody(body, settings.secret);

  try {
    const res = await doFetch(settings.url, {
      method: 'POST',
      headers,
      body,
      // Redirects are followed: Google Apps Script web apps answer a POST with a 302.
      signal: AbortSignal.timeout(deps.timeoutMs ?? WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      deps.logger.warn('Webhook answered with an error', {
        status: res.status,
        event: payload.event,
        email: maskEmail(payload.signup.email),
      });
      return false;
    }
    return true;
  } catch (error) {
    deps.logger.warn('Webhook failed', {
      error: describeError(error),
      event: payload.event,
      email: maskEmail(payload.signup.email),
    });
    return false;
  }
}
