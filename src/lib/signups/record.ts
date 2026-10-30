import { createHash } from 'node:crypto';
import type { SignupInput, SignupRecord, SignupSource } from './types';

export const STORAGE_PREFIX = 'signups/';

/** Normalise an email the same way validation does, so lookups match stored records. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** sha256 of the normalised email, as hex. The record id and file name. */
export function emailHash(email: string): string {
  return createHash('sha256').update(normaliseEmail(email), 'utf8').digest('hex');
}

/** `signups/<sha256(email)>.json`: one file per person, so repeats overwrite, not duplicate. */
export function signupKey(email: string): string {
  return `${STORAGE_PREFIX}${emailHash(email)}.json`;
}

function copySource(source: SignupSource): SignupSource {
  return { ...source };
}

/**
 * Apply a submission to an existing record (or create one).
 * New: everything from the submission. Repeat: keep createdAt and firstSource, take a new
 * first name or consent version only if one was given, bump updatedAt and submissions.
 */
export function applySubmission(
  existing: SignupRecord | null,
  input: SignupInput,
  now: Date,
): SignupRecord {
  const at = now.toISOString();
  if (!existing) {
    return {
      id: emailHash(input.email),
      email: normaliseEmail(input.email),
      firstName: input.firstName,
      consentVersion: input.consentVersion,
      createdAt: at,
      updatedAt: at,
      submissions: 1,
      firstSource: copySource(input.source),
      lastSource: copySource(input.source),
      flagged: input.flagged ?? null,
    };
  }
  return {
    ...existing,
    firstName: input.firstName || existing.firstName,
    consentVersion: input.consentVersion || existing.consentVersion,
    updatedAt: at,
    submissions: (existing.submissions || 1) + 1,
    firstSource: copySource(existing.firstSource),
    lastSource: copySource(input.source),
    // One clean submission is enough to trust the record; a flagged one never downgrades it.
    flagged: existing.flagged && input.flagged ? existing.flagged : null,
  };
}

const EMPTY_SOURCE: SignupSource = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  referrer: null,
  page: null,
};

function readSource(value: unknown): SignupSource {
  const source = { ...EMPTY_SOURCE };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(source) as (keyof SignupSource)[]) {
      const v = (value as Record<string, unknown>)[key];
      source[key] = typeof v === 'string' ? v : null;
    }
  }
  return source;
}

/** Read a stored record defensively. Returns null if it isn't one of ours. */
export function parseStoredRecord(value: unknown): SignupRecord | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.email !== 'string' || typeof r.createdAt !== 'string') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: str(r.id) ?? emailHash(r.email),
    email: r.email,
    firstName: str(r.firstName),
    consentVersion: str(r.consentVersion),
    createdAt: r.createdAt,
    updatedAt: str(r.updatedAt) ?? r.createdAt,
    submissions: typeof r.submissions === 'number' && r.submissions > 0 ? r.submissions : 1,
    firstSource: readSource(r.firstSource),
    lastSource: readSource(r.lastSource ?? r.firstSource),
    flagged: r.flagged === 'honeypot' || r.flagged === 'too_fast' ? r.flagged : null,
  };
}
