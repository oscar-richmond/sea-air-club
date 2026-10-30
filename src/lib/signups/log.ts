import type { Logger } from './types';

/**
 * Mask an email for logs: `alex@example.com` → `a***@example.com`.
 * Full emails never go into logs.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** Errors can carry request details; keep only the name and message. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

const PREFIX = '[signups]';

export const consoleLogger: Logger = {
  info: (message, meta) => console.info(PREFIX, message, ...(meta ? [meta] : [])),
  warn: (message, meta) => console.warn(PREFIX, message, ...(meta ? [meta] : [])),
  error: (message, meta) => console.error(PREFIX, message, ...(meta ? [meta] : [])),
};

/** For tests: swallows everything. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
