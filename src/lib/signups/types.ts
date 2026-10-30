/**
 * Server-side types for sign-ups. The browser-facing request and response shapes
 * live in `contract.ts`; these are the shapes we store and pass around.
 */

/** Where a sign-up came from. Every field is optional on the way in, so `null` when absent. */
export interface SignupSource {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  page: string | null;
}

/** One person on the early access list. Stored as one JSON file per email. */
export interface SignupRecord {
  /** sha256 of the normalised email. Also the storage file name. */
  id: string;
  email: string;
  firstName: string | null;
  /** Version of the consent wording they agreed to (latest submission wins). */
  consentVersion: string | null;
  /** ISO 8601, first sign-up. */
  createdAt: string;
  /** ISO 8601, latest submission. */
  updatedAt: string;
  /** How many times this email has been submitted. */
  submissions: number;
  /** Source of the first sign-up (kept forever). */
  firstSource: SignupSource;
  /** Source of the latest submission. */
  lastSource: SignupSource;
  /** Set when every submission so far tripped a spam check. Left out of the CSV by default. */
  flagged: 'honeypot' | 'too_fast' | null;
}

/** A validated, cleaned submission, ready to store. */
export interface SignupInput {
  email: string;
  firstName: string | null;
  consentVersion: string | null;
  source: SignupSource;
  /** Spam check hit for this submission, if any. */
  flagged?: 'honeypot' | 'too_fast' | null;
}

export interface UpsertResult {
  record: SignupRecord;
  /** True for a brand new email, false for a repeat. */
  created: boolean;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
