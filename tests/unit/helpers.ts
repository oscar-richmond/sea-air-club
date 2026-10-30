import type { Logger } from '../../src/lib/signups/types';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown> | undefined;
}

/** A logger that records everything, so tests can check what would have been logged. */
export function recordingLogger(): Logger & { entries: LogEntry[]; text(): string } {
  const entries: LogEntry[] = [];
  const add = (level: LogEntry['level']) => (message: string, meta?: Record<string, unknown>) => {
    entries.push({ level, message, meta });
  };
  return {
    entries,
    info: add('info'),
    warn: add('warn'),
    error: add('error'),
    text: () => entries.map((e) => `${e.message} ${JSON.stringify(e.meta ?? {})}`).join('\n'),
  };
}

export const SITE = 'https://seaairclub.co.uk';

export function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = `${SITE}/api/subscribe`,
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function formRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${SITE}/api/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: SITE,
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

export function multipartRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(`${SITE}/api/subscribe`, {
    method: 'POST',
    headers: { origin: SITE, ...headers },
    body: form,
  });
}
