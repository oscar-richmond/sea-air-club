import { describe, expect, it } from 'vitest';
import { isAuthorised, parseBasicAuth, safeEqual } from '../../src/lib/signups/admin-auth';
import { BOM } from '../../src/lib/signups/csv';
import {
  createExportFailureLimiter,
  handleExport,
  isTestEmail,
  type ExportDeps,
} from '../../src/lib/signups/export';
import { createMemoryStore } from '../../src/lib/signups/store';
import type { SignupInput } from '../../src/lib/signups/types';
import { recordingLogger, SITE } from './helpers';

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

describe('basic auth', () => {
  it('parses the header', () => {
    expect(parseBasicAuth(basic('admin', 'pa:ss'))).toEqual({ user: 'admin', password: 'pa:ss' });
    expect(parseBasicAuth('Bearer abc')).toBeNull();
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth(`Basic ${Buffer.from('nocolon').toString('base64')}`)).toBeNull();
  });

  it('accepts only admin with the right password', () => {
    expect(isAuthorised(basic('admin', 'correct horse'), 'correct horse')).toBe(true);
    expect(isAuthorised(basic('admin', 'wrong'), 'correct horse')).toBe(false);
    expect(isAuthorised(basic('Admin', 'correct horse'), 'correct horse')).toBe(false);
    expect(isAuthorised(basic('admin', 'correct horse '), 'correct horse')).toBe(false);
    expect(isAuthorised(null, 'correct horse')).toBe(false);
  });

  it('never matches when no password is configured', () => {
    expect(isAuthorised(basic('admin', ''), undefined)).toBe(false);
    expect(isAuthorised(basic('admin', ''), '')).toBe(false);
  });

  it('compares in constant time regardless of length', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'a much longer string')).toBe(false);
  });
});

const NOW = new Date('2026-11-12T15:00:00.000Z');

async function setup(overrides: Partial<ExportDeps> = {}) {
  const store = createMemoryStore();
  const logger = recordingLogger();
  const add = (email: string, iso: string, extra: Partial<SignupInput> = {}) =>
    store.upsert(
      {
        email,
        firstName: null,
        consentVersion: '2026-10',
        source: {
          utm_source: 'qr',
          utm_medium: 'website',
          utm_campaign: 'early-access',
          utm_content: null,
          utm_term: null,
          referrer: null,
          page: '/',
        },
        ...extra,
      },
      new Date(iso),
    );
  await add('ann@example.com', '2026-11-01T10:00:00.000Z', { firstName: 'Ann' });
  await add('bob@example.com', '2026-11-08T10:00:00.000Z', { firstName: '@Bob' });
  await add('bot@example.com', '2026-11-09T10:00:00.000Z', { flagged: 'too_fast' });

  const deps: ExportDeps = {
    getStore: () => store,
    adminPassword: 'test',
    failureLimiter: createExportFailureLimiter(),
    logger,
    now: () => NOW,
    ...overrides,
  };
  const get = (path = '/api/admin/signups.csv', headers: Record<string, string> = {}) =>
    handleExport(new Request(`${SITE}${path}`, { headers }), deps);
  return { get, store, logger };
}

describe('GET /api/admin/signups.csv', () => {
  it('is 404 when ADMIN_EXPORT_PASSWORD is unset', async () => {
    const { get } = await setup({ adminPassword: undefined });
    const res = await get('/api/admin/signups.csv', { authorization: basic('admin', '') });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('asks for a password with 401 and WWW-Authenticate', async () => {
    const { get } = await setup();
    const attempts: Record<string, string>[] = [{}, { authorization: basic('admin', 'nope') }];
    for (const headers of attempts) {
      const res = await get('/api/admin/signups.csv', headers);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm="Sea Air Club"/);
      expect(await res.text()).not.toContain('@example.com');
    }
  });

  it('returns the CSV with download headers', async () => {
    const { get } = await setup();
    const res = await get('/api/admin/signups.csv?include_tests=1', {
      authorization: basic('admin', 'test'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="sea-air-club-early-access-2026-11-12.csv"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith(BOM)).toBe(true);
    const lines = text.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^ann@example\.com,Ann,2026-11-01T10:00:00\.000Z,/);
    expect(lines[2]).toMatch(/^bob@example\.com,'@Bob,/);
  });

  it('leaves reserved test addresses out unless ?include_tests=1', async () => {
    const { get } = await setup();
    const auth = { authorization: basic('admin', 'test') };
    const lines = (await (await get('/api/admin/signups.csv', auth)).text()).trimEnd().split('\r\n');
    expect(lines).toHaveLength(1); // header only: every seeded record is @example.com
    expect(isTestEmail('qa+1@example.com')).toBe(true);
    expect(isTestEmail('someone@mail.example.org')).toBe(true);
    expect(isTestEmail('x@foo.test')).toBe(true);
    expect(isTestEmail('guest@gmail.com')).toBe(false);
    expect(isTestEmail('hello@examples.com')).toBe(false);
  });

  it('leaves flagged sign-ups out unless ?include_flagged=1', async () => {
    const { get } = await setup();
    const auth = { authorization: basic('admin', 'test') };
    const plain = await (await get('/api/admin/signups.csv?include_tests=1', auth)).text();
    expect(plain).not.toContain('bot@example.com');
    const all = await (
      await get('/api/admin/signups.csv?include_tests=1&include_flagged=1', auth)
    ).text();
    expect(all).toContain('bot@example.com');
  });

  it('filters with ?since=YYYY-MM-DD', async () => {
    const { get } = await setup();
    const auth = { authorization: basic('admin', 'test') };
    const res = await get('/api/admin/signups.csv?since=2026-11-05&include_tests=1', auth);
    const lines = (await res.text()).trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^bob@example\.com/);

    const bad = await get('/api/admin/signups.csv?since=5th', auth);
    expect(bad.status).toBe(400);
  });

  it('pauses an IP after 10 wrong passwords, even for the right one', async () => {
    const { get } = await setup();
    const ip = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < 10; i++) {
      const res = await get('/api/admin/signups.csv', {
        ...ip,
        authorization: basic('admin', `guess${i}`),
      });
      expect(res.status).toBe(401);
    }
    const locked = await get('/api/admin/signups.csv', {
      ...ip,
      authorization: basic('admin', 'test'),
    });
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBeTruthy();

    // Requests without credentials (the browser's first try) don't count.
    const { get: get2 } = await setup();
    for (let i = 0; i < 20; i++) await get2('/api/admin/signups.csv', ip);
    const fine = await get2('/api/admin/signups.csv', {
      ...ip,
      authorization: basic('admin', 'test'),
    });
    expect(fine.status).toBe(200);
  });

  it('is a 500 with no data when the store fails', async () => {
    const { get } = await setup({
      getStore: () => ({
        kind: 'blob',
        upsert: async () => {
          throw new Error('x');
        },
        get: async () => null,
        list: async () => {
          throw new Error('Blob down');
        },
        delete: async () => false,
      }),
    });
    const res = await get('/api/admin/signups.csv', { authorization: basic('admin', 'test') });
    expect(res.status).toBe(500);
  });
});
