import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../src/lib/signups/log';
import { applySubmission, emailHash, signupKey } from '../../src/lib/signups/record';
import { createBlobStore, type BlobApi } from '../../src/lib/signups/store/blob';
import { chooseStoreKind, createStore } from '../../src/lib/signups/store/index';
import { createMemoryStore } from '../../src/lib/signups/store/memory';
import type { SignupInput, SignupSource } from '../../src/lib/signups/types';
import { recordingLogger } from './helpers';

const source = (overrides: Partial<SignupSource> = {}): SignupSource => ({
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  referrer: null,
  page: '/',
  ...overrides,
});

const input = (overrides: Partial<SignupInput> = {}): SignupInput => ({
  email: 'alex@example.com',
  firstName: 'Alex',
  consentVersion: '2026-10',
  source: source({ utm_source: 'postcard', utm_medium: 'print' }),
  ...overrides,
});

const T1 = new Date('2026-11-01T09:00:00.000Z');
const T2 = new Date('2026-11-03T18:30:00.000Z');

describe('keys', () => {
  it('stores each email at signups/<sha256(email)>.json', () => {
    const hash = createHash('sha256').update('alex@example.com').digest('hex');
    expect(signupKey('alex@example.com')).toBe(`signups/${hash}.json`);
    expect(signupKey('  ALEX@Example.com ')).toBe(`signups/${hash}.json`);
    expect(emailHash('alex@example.com')).toBe(hash);
  });
});

describe('applySubmission', () => {
  it('creates a full record', () => {
    const r = applySubmission(null, input(), T1);
    expect(r).toEqual({
      id: emailHash('alex@example.com'),
      email: 'alex@example.com',
      firstName: 'Alex',
      consentVersion: '2026-10',
      createdAt: T1.toISOString(),
      updatedAt: T1.toISOString(),
      submissions: 1,
      firstSource: source({ utm_source: 'postcard', utm_medium: 'print' }),
      lastSource: source({ utm_source: 'postcard', utm_medium: 'print' }),
    });
    // No IP address or user agent, ever.
    expect(Object.keys(r).sort()).toEqual(
      [
        'consentVersion',
        'createdAt',
        'email',
        'firstName',
        'firstSource',
        'id',
        'lastSource',
        'submissions',
        'updatedAt',
      ].sort(),
    );
  });
});

describe('memory store', () => {
  it('upserts: a repeat updates the same record instead of duplicating', async () => {
    const store = createMemoryStore();
    const first = await store.upsert(input(), T1);
    expect(first.created).toBe(true);

    const second = await store.upsert(
      input({
        firstName: 'Alexandra',
        consentVersion: null,
        source: source({ utm_source: 'instagram', page: '/join' }),
      }),
      T2,
    );
    expect(second.created).toBe(false);
    expect(second.record).toMatchObject({
      email: 'alex@example.com',
      firstName: 'Alexandra',
      consentVersion: '2026-10',
      createdAt: T1.toISOString(),
      updatedAt: T2.toISOString(),
      submissions: 2,
      firstSource: { utm_source: 'postcard', utm_medium: 'print', page: '/' },
      lastSource: { utm_source: 'instagram', page: '/join' },
    });

    const all = await store.list();
    expect(all).toHaveLength(1);
  });

  it('dedupes by normalised email', async () => {
    const store = createMemoryStore();
    await store.upsert(input({ email: 'alex@example.com' }), T1);
    const again = await store.upsert(input({ email: 'Alex@Example.com' }), T2);
    expect(again.created).toBe(false);
    expect(await store.list()).toHaveLength(1);
  });

  it('keeps the existing first name when a repeat leaves it blank', async () => {
    const store = createMemoryStore();
    await store.upsert(input(), T1);
    const again = await store.upsert(input({ firstName: null }), T2);
    expect(again.record.firstName).toBe('Alex');
  });

  it('gets and deletes one person', async () => {
    const store = createMemoryStore();
    await store.upsert(input(), T1);
    await store.upsert(input({ email: 'sam@example.com', firstName: 'Sam' }), T1);
    expect((await store.get('ALEX@example.com'))?.firstName).toBe('Alex');
    expect(await store.delete('alex@example.com')).toBe(true);
    expect(await store.delete('alex@example.com')).toBe(false);
    expect((await store.list()).map((r) => r.email)).toEqual(['sam@example.com']);
  });

  it('returns copies, so callers cannot change stored records', async () => {
    const store = createMemoryStore();
    const { record } = await store.upsert(input(), T1);
    record.firstName = 'Changed';
    expect((await store.get('alex@example.com'))?.firstName).toBe('Alex');
  });
});

/** An in-memory stand-in for the Vercel Blob API, with ETags and conditional writes. */
function fakeBlob(options: { pageSize?: number } = {}) {
  const files = new Map<string, { body: string; etag: number }>();
  let etagCounter = 0;
  let inFlight = 0;
  const stats = { maxInFlight: 0, listCalls: 0, gets: 0, puts: [] as Record<string, unknown>[] };
  const hooks: { beforePut?: (pathname: string) => void } = {};

  const api: BlobApi = {
    async put(pathname, body, opts) {
      stats.puts.push({ pathname, ...opts });
      hooks.beforePut?.(pathname);
      const existing = files.get(pathname);
      if (existing && !opts.allowOverwrite) throw new Error('This blob already exists');
      if (opts.ifMatch && (!existing || String(existing.etag) !== opts.ifMatch)) {
        throw new BlobPreconditionFailedError();
      }
      files.set(pathname, { body, etag: ++etagCounter });
      return { etag: String(etagCounter) };
    },
    async get(pathname, opts) {
      expect(opts.access).toBe('private');
      stats.gets++;
      inFlight++;
      stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      const file = files.get(pathname);
      if (!file) return null;
      return {
        statusCode: 200 as const,
        stream: new Response(file.body).body!,
        blob: { etag: String(file.etag) },
      };
    },
    async list(opts) {
      stats.listCalls++;
      const all = [...files.keys()].filter((p) => p.startsWith(opts.prefix ?? '')).sort();
      const size = options.pageSize ?? 1000;
      const start = opts.cursor ? Number(opts.cursor) : 0;
      const page = all.slice(start, start + size);
      const hasMore = start + size < all.length;
      return {
        blobs: page.map((pathname) => ({ pathname })),
        hasMore,
        ...(hasMore ? { cursor: String(start + size) } : {}),
      };
    },
    async del(pathname) {
      files.delete(pathname);
    },
  };
  return { api, files, stats, hooks };
}

describe('blob store', () => {
  it('writes private JSON at the hashed key, and upserts repeats', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger, token: 'test-token' });

    const first = await store.upsert(input(), T1);
    expect(first.created).toBe(true);
    expect(blob.stats.puts[0]).toMatchObject({
      pathname: signupKey('alex@example.com'),
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: false,
      token: 'test-token',
    });

    const second = await store.upsert(input({ firstName: null }), T2);
    expect(second.created).toBe(false);
    expect(second.record.submissions).toBe(2);
    expect(blob.stats.puts[1]).toMatchObject({ allowOverwrite: true, ifMatch: '1' });
    expect(blob.files.size).toBe(1);
    expect(JSON.parse(blob.files.get(signupKey('alex@example.com'))!.body)).toMatchObject({
      email: 'alex@example.com',
      firstName: 'Alex',
      submissions: 2,
    });
  });

  it('retries when another submission wrote the same file first', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger });
    await store.upsert(input(), T1);

    // Simulate a racing write landing between our read and our write.
    let raced = false;
    blob.hooks.beforePut = (pathname) => {
      if (raced) return;
      raced = true;
      const file = blob.files.get(pathname)!;
      blob.files.set(pathname, { ...file, etag: 99 });
    };
    const result = await store.upsert(input(), T2);
    expect(result.record.submissions).toBe(2);
    expect(blob.stats.puts).toHaveLength(3);
  });

  it('turns a racing create into an update', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger });
    let raced = false;
    blob.hooks.beforePut = (pathname) => {
      if (raced) return;
      raced = true;
      const other = applySubmission(null, input({ firstName: 'Other tab' }), T1);
      blob.files.set(pathname, { body: JSON.stringify(other), etag: 50 });
    };
    const result = await store.upsert(input(), T2);
    expect(result.created).toBe(false);
    expect(result.record.submissions).toBe(2);
    expect(result.record.createdAt).toBe(T1.toISOString());
  });

  it('gives up after a few conflicts and reports the error', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger });
    await store.upsert(input(), T1);
    blob.hooks.beforePut = (pathname) => {
      const file = blob.files.get(pathname)!;
      blob.files.set(pathname, { ...file, etag: file.etag + 1000 });
    };
    await expect(store.upsert(input(), T2)).rejects.toBeInstanceOf(BlobPreconditionFailedError);
  });

  it('lists every page and reads records with limited concurrency', async () => {
    const blob = fakeBlob({ pageSize: 7 });
    const store = createBlobStore({ api: blob.api, logger: silentLogger, concurrency: 8 });
    for (let i = 0; i < 30; i++) {
      await store.upsert(input({ email: `person${i}@example.com` }), T1);
    }
    blob.stats.gets = 0;
    blob.stats.maxInFlight = 0;

    const all = await store.list();
    expect(all).toHaveLength(30);
    expect(new Set(all.map((r) => r.email)).size).toBe(30);
    expect(blob.stats.listCalls).toBe(5); // 7 + 7 + 7 + 7 + 2
    expect(blob.stats.gets).toBe(30);
    expect(blob.stats.maxInFlight).toBeLessThanOrEqual(8);
    expect(blob.stats.maxInFlight).toBeGreaterThan(1);
  });

  it('skips files that are not sign-up records, with a warning', async () => {
    const blob = fakeBlob();
    const logger = recordingLogger();
    const store = createBlobStore({ api: blob.api, logger });
    await store.upsert(input(), T1);
    blob.files.set('signups/broken.json', { body: '{not json', etag: 7 });
    blob.files.set('signups/odd.json', { body: '{"hello":"world"}', etag: 8 });
    expect(await store.list()).toHaveLength(1);
    expect(logger.entries.filter((e) => e.level === 'warn')).toHaveLength(2);
  });

  it('fails the whole export if a record cannot be read', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger });
    await store.upsert(input(), T1);
    blob.api.get = async () => {
      throw new Error('Blob service unavailable');
    };
    await expect(store.list()).rejects.toThrow('Blob service unavailable');
  });

  it('deletes one person', async () => {
    const blob = fakeBlob();
    const store = createBlobStore({ api: blob.api, logger: silentLogger });
    await store.upsert(input(), T1);
    expect(await store.delete('alex@example.com')).toBe(true);
    expect(blob.files.size).toBe(0);
    expect(await store.delete('alex@example.com')).toBe(false);
  });
});

describe('store selection', () => {
  it('uses SIGNUP_STORE when set, otherwise Blob if a token exists, else memory', () => {
    expect(chooseStoreKind({ store: 'memory', blobToken: 'tok' })).toBe('memory');
    expect(chooseStoreKind({ store: 'blob' })).toBe('blob');
    expect(chooseStoreKind({ blobToken: 'tok' })).toBe('blob');
    expect(chooseStoreKind({})).toBe('memory');
  });

  it('warns loudly when production would use the memory store', () => {
    const logger = recordingLogger();
    expect(createStore({ vercelEnv: 'production' }, logger).kind).toBe('memory');
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]?.level).toBe('error');
    expect(logger.entries[0]?.message).toMatch(/NOT BEING SAVED/);
  });

  it('stays quiet for memory outside production', () => {
    const logger = recordingLogger();
    createStore({ vercelEnv: 'preview' }, logger);
    createStore({}, logger);
    expect(logger.entries).toHaveLength(0);
  });
});
