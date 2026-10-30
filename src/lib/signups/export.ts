import { ADMIN_REALM, isAuthorised } from './admin-auth';
import { csvFilename, filterSince, parseSince, toCsv } from './csv';
import { NO_STORE_HEADERS } from './http';
import { describeError } from './log';
import { createRateLimiter, getClientIp, type RateLimiter } from './rate-limit';
import type { SignupStore } from './store/types';
import type { Logger } from './types';

/** Wrong passwords allowed per IP before a pause: 10 per 15 minutes, per server instance. */
export function createExportFailureLimiter(): RateLimiter {
  return createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
}

export interface ExportDeps {
  getStore: () => SignupStore;
  /** ADMIN_EXPORT_PASSWORD. Unset disables the export (404). */
  adminPassword: string | undefined;
  /** Counts wrong passwords per IP. */
  failureLimiter: RateLimiter;
  logger: Logger;
  clientAddress?: string | null;
  now?: () => Date;
}

function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex',
      ...headers,
    },
  });
}

/** GET /api/admin/signups.csv: password-protected CSV of every sign-up, for ResNexus. */
export async function handleExport(request: Request, deps: ExportDeps): Promise<Response> {
  const { logger } = deps;
  const now = deps.now ?? (() => new Date());

  if (!deps.adminPassword) return text('Not found', 404);

  const ip = getClientIp(request.headers, deps.clientAddress);
  const lockout = deps.failureLimiter.peek(ip);
  if (!lockout.allowed) {
    return text('Too many wrong passwords. Try again later.', 429, {
      'Retry-After': String(lockout.retryAfterSeconds),
    });
  }

  const header = request.headers.get('authorization');
  if (!isAuthorised(header, deps.adminPassword)) {
    // The browser's first request never has credentials; only count real wrong guesses.
    if (header) {
      deps.failureLimiter.hit(ip);
      logger.warn('Wrong password for the sign-ups export');
    }
    return text('Password required', 401, {
      'WWW-Authenticate': `Basic realm="${ADMIN_REALM}", charset="UTF-8"`,
    });
  }

  const params = new URL(request.url).searchParams;
  const since = parseSince(params.get('since'));
  // Test sign-ups use reserved domains (example.com, .test, .invalid); leave them out of the
  // ResNexus import unless asked for with ?include_tests=1.
  const includeTests = params.get('include_tests') === '1';
  if (since === null) {
    return text('Invalid "since" date. Use YYYY-MM-DD, e.g. ?since=2026-11-01', 400);
  }

  let records;
  try {
    records = await deps.getStore().list();
  } catch (error) {
    logger.error('Sign-ups export failed', { error: describeError(error) });
    return text('Could not read the sign-ups. Please try again in a minute.', 500);
  }

  const rows = filterSince(records, since).filter(
    (record) => includeTests || !isTestEmail(record.email),
  );
  logger.info('Sign-ups exported', { rows: rows.length, since: since?.toISOString() ?? null });

  return new Response(toCsv(rows), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(now())}"`,
      'X-Robots-Tag': 'noindex',
    },
  });
}

/** Addresses on domains reserved for testing (RFC 2606/6761). They can never be real people. */
export function isTestEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return (
    /^(.+\.)?example\.(com|org|net)$/.test(domain) ||
    /\.(test|invalid|example|localhost)$/.test(domain)
  );
}
