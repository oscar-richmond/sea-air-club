import { z } from 'astro/zod';
import { FIELD } from './contract';
import type { SignupInput, SignupSource } from './types';

/** Field limits. Email and first name are validated; the rest are quietly truncated. */
export const LIMITS = {
  email: 254,
  firstName: 60,
  utm: 100,
  referrer: 500,
  page: 200,
  consentVersion: 40,
} as const;

export const MESSAGES = {
  emailRequired: 'Please enter your email address.',
  emailInvalid: 'Please enter a valid email address.',
  emailTooLong: 'That email address is too long.',
  firstNameInvalid: 'Please enter your first name as text.',
  firstNameTooLong: `Please keep your first name to ${LIMITS.firstName} characters or fewer.`,
} as const;

export type FieldErrors = Partial<Record<'email' | 'firstName', string>>;

export type ParseResult =
  { ok: true; input: SignupInput } | { ok: false; fieldErrors: FieldErrors };

/** The raw body, as parsed from JSON or form data. Values are untrusted. */
export type RawSubmission = Record<string, unknown>;

// Control characters. Whitespace ones become spaces; the rest are removed.
const WHITESPACE_CONTROLS = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
const OTHER_CONTROLS = /\p{Cc}/gu;
// Bidirectional overrides and isolates: invisible, and used to disguise text.
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Clean a first name: strip control characters and `<` `>`, collapse whitespace, trim.
 * Returns an empty string if nothing is left.
 */
export function cleanFirstName(value: string): string {
  return value
    .replace(WHITESPACE_CONTROLS, ' ')
    .replace(OTHER_CONTROLS, '')
    .replace(BIDI_CONTROLS, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean a free-text metadata field and cut it to `max` characters. Null if empty or not text. */
export function cleanMeta(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(WHITESPACE_CONTROLS, ' ')
    .replace(OTHER_CONTROLS, '')
    .replace(BIDI_CONTROLS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return cleaned === '' ? null : cleaned;
}

/**
 * Referrer: keep only the origin and path of a web address. Query strings can carry
 * other people's tracking IDs or personal data, and the origin is what tells us the source.
 */
export function cleanReferrer(value: unknown): string | null {
  const text = cleanMeta(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `${url.origin}${url.pathname}`.slice(0, LIMITS.referrer);
    }
  } catch {
    // Not a URL: keep the text as given.
  }
  return text.slice(0, LIMITS.referrer);
}

/**
 * Landing page: keep the path only. UTM tags arrive in their own fields, and dropping the
 * query string means nothing personal sneaks in through it.
 */
export function cleanPage(value: unknown): string | null {
  const text = cleanMeta(value, 2048);
  if (!text) return null;
  let path = text;
  if (!text.startsWith('/')) {
    try {
      const url = new URL(text);
      if (url.protocol === 'http:' || url.protocol === 'https:') path = url.pathname;
    } catch {
      // Not a URL: keep the text as given.
    }
  }
  path = path.split(/[?#]/)[0] || '/';
  return path.slice(0, LIMITS.page);
}

export function cleanSource(raw: RawSubmission): SignupSource {
  return {
    utm_source: cleanMeta(raw[FIELD.utmSource], LIMITS.utm),
    utm_medium: cleanMeta(raw[FIELD.utmMedium], LIMITS.utm),
    utm_campaign: cleanMeta(raw[FIELD.utmCampaign], LIMITS.utm),
    utm_content: cleanMeta(raw[FIELD.utmContent], LIMITS.utm),
    utm_term: cleanMeta(raw[FIELD.utmTerm], LIMITS.utm),
    referrer: cleanReferrer(raw[FIELD.referrer]),
    page: cleanPage(raw[FIELD.page]),
  };
}

const emailSchema = z
  .string({ error: MESSAGES.emailRequired })
  .trim()
  .toLowerCase()
  .min(1, { error: MESSAGES.emailRequired })
  .max(LIMITS.email, { error: MESSAGES.emailTooLong })
  .pipe(z.email({ error: MESSAGES.emailInvalid }));

const firstNameSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return value;
    const cleaned = cleanFirstName(value);
    return cleaned === '' ? null : cleaned;
  },
  z
    .string({ error: MESSAGES.firstNameInvalid })
    .max(LIMITS.firstName, { error: MESSAGES.firstNameTooLong })
    .nullable(),
);

const submissionSchema = z.object({
  email: emailSchema,
  firstName: firstNameSchema,
});

/** Validate and clean a submission. Spam checks are separate (see `spam.ts`). */
export function parseSubmission(raw: RawSubmission): ParseResult {
  const result = submissionSchema.safeParse({
    email: raw[FIELD.email],
    firstName: raw[FIELD.firstName],
  });

  if (!result.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if ((key === 'email' || key === 'firstName') && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    // Belt and braces: never return a validation error with nothing to show.
    if (!fieldErrors.email && !fieldErrors.firstName) fieldErrors.email = MESSAGES.emailInvalid;
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      email: result.data.email,
      firstName: result.data.firstName,
      consentVersion: cleanMeta(raw[FIELD.consentVersion], LIMITS.consentVersion),
      source: cleanSource(raw),
    },
  };
}
