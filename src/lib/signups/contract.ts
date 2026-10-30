/**
 * The sign-up API contract, shared by the browser script and the server.
 * Changing this file changes both sides: keep it small and versioned.
 *
 * POST /api/subscribe
 *   Content-Type: application/json            → JSON response (used by the pop-up)
 *   Content-Type: application/x-www-form-urlencoded or multipart/form-data
 *                                             → 303 redirect (no-JavaScript fallback)
 */

/** Form field names. The HTML form and the JSON body use the same keys. */
export const FIELD = {
  firstName: 'firstName',
  email: 'email',
  /** Honeypot: hidden from people, filled in by bots. Must arrive empty. */
  honeypot: 'company',
  /** Milliseconds between the form being shown and submitted. Bots are instant. */
  elapsedMs: 'elapsedMs',
  consentVersion: 'consentVersion',
  /** Where the sign-up came from. */
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',
  utmTerm: 'utm_term',
  referrer: 'referrer',
  page: 'page',
} as const;

export type FieldName = (typeof FIELD)[keyof typeof FIELD];

export interface SubscribeRequest {
  firstName?: string;
  email: string;
  company?: string;
  elapsedMs?: number;
  consentVersion?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  page?: string;
}

export type SubscribeResponse =
  | {
      ok: true;
      /** Cleaned first name, for "Thanks, Alex." */
      firstName: string | null;
      /** True if this email was already on the list (we still say thanks). */
      alreadySubscribed: boolean;
    }
  | {
      ok: false;
      error: 'validation';
      fieldErrors: Partial<Record<'email' | 'firstName', string>>;
    }
  | { ok: false; error: 'rate_limited' }
  | { ok: false; error: 'server' };

/** No-JavaScript fallback redirect targets. */
export const REDIRECT = {
  success: '/join/thanks',
  /** `?error=validation|rate_limited|server` is appended. */
  failure: '/join',
} as const;
