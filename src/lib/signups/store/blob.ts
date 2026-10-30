import {
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put,
  type DeleteCommandOptions,
  type GetCommandOptions,
  type ListCommandOptions,
  type PutCommandOptions,
} from '@vercel/blob';
import { mapWithConcurrency } from '../concurrency';
import { describeError } from '../log';
import {
  STORAGE_PREFIX,
  applySubmission,
  emailHash,
  parseStoredRecord,
  signupKey,
} from '../record';
import type { Logger, SignupRecord } from '../types';
import type { SignupStore } from './types';

/** The parts of `@vercel/blob` we use. Swappable in tests. */
export interface BlobApi {
  put(pathname: string, body: string, options: PutCommandOptions): Promise<{ etag: string }>;
  get(
    pathname: string,
    options: GetCommandOptions,
  ): Promise<{
    statusCode: 200 | 304;
    stream: ReadableStream<Uint8Array> | null;
    blob: { etag: string };
  } | null>;
  list(options: ListCommandOptions): Promise<{
    blobs: { pathname: string }[];
    cursor?: string;
    hasMore: boolean;
  }>;
  del(pathname: string, options: DeleteCommandOptions): Promise<void>;
}

export const vercelBlobApi: BlobApi = { put, get, list, del };

export interface BlobStoreOptions {
  /** Read-write token. If omitted, `@vercel/blob` reads BLOB_READ_WRITE_TOKEN itself. */
  token?: string;
  api?: BlobApi;
  /** Parallel record reads during an export. */
  concurrency?: number;
  /** Per-call timeout, so a slow Blob API can't run past the function's time limit. */
  timeoutMs?: number;
  logger: Logger;
}

const MAX_WRITE_ATTEMPTS = 3;

/**
 * Vercel Blob, private store. One JSON file per person at `signups/<sha256(email)>.json`.
 *
 * Writes are conditional: a new file is only created if none exists, and an update only
 * lands if the file hasn't changed since we read it. If two submissions for the same
 * email race, the loser re-reads and tries again, so no submission is lost.
 */
export function createBlobStore({
  token,
  api = vercelBlobApi,
  concurrency = 8,
  timeoutMs = 6000,
  logger,
}: BlobStoreOptions): SignupStore {
  const auth = token ? { token } : {};
  const signal = () => AbortSignal.timeout(timeoutMs);

  async function read(pathname: string): Promise<{ record: SignupRecord; etag: string } | null> {
    const res = await api.get(pathname, {
      access: 'private',
      useCache: false,
      abortSignal: signal(),
      ...auth,
    });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      logger.warn('Skipping unreadable sign-up file', { pathname });
      return null;
    }
    const record = parseStoredRecord(parsed);
    if (!record) {
      logger.warn('Skipping sign-up file with unexpected shape', { pathname });
      return null;
    }
    return { record, etag: res.blob.etag };
  }

  return {
    kind: 'blob',

    async upsert(input, now = new Date()) {
      const key = signupKey(input.email);
      for (let attempt = 1; ; attempt++) {
        const current = await read(key);
        const record = applySubmission(current?.record ?? null, input, now);
        try {
          await api.put(key, JSON.stringify(record), {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            // Shortest allowed. Reads bypass the cache anyway (useCache: false).
            cacheControlMaxAge: 60,
            ...(current
              ? { allowOverwrite: true, ...(current.etag ? { ifMatch: current.etag } : {}) }
              : { allowOverwrite: false }),
            abortSignal: signal(),
            ...auth,
          });
          return { record, created: current === null };
        } catch (error) {
          if (attempt >= MAX_WRITE_ATTEMPTS) throw error;
          // Someone else wrote this file between our read and write: read again and retry.
          if (error instanceof BlobPreconditionFailedError) continue;
          // A create can fail because the file appeared meanwhile; anything else is real.
          if (!current && (await read(key).catch(() => null))) continue;
          throw error;
        }
      }
    },

    async get(email) {
      return (await read(signupKey(email)))?.record ?? null;
    },

    async list() {
      const pathnames: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.list({
          prefix: STORAGE_PREFIX,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
          abortSignal: signal(),
          ...auth,
        });
        for (const blob of page.blobs) {
          if (blob.pathname.endsWith('.json')) pathnames.push(blob.pathname);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      const records = await mapWithConcurrency(pathnames, concurrency, async (pathname) => {
        try {
          return (await read(pathname))?.record ?? null;
        } catch (error) {
          // A failed read must fail the export, or someone would silently be left out.
          logger.error('Could not read a sign-up during export', {
            pathname,
            error: describeError(error),
          });
          throw error;
        }
      });
      return records.filter((r): r is SignupRecord => r !== null);
    },

    async delete(email) {
      const key = signupKey(email);
      const existing = await read(key);
      if (!existing) return false;
      await api.del(key, { abortSignal: signal(), ...auth });
      logger.info('Deleted sign-up', { id: emailHash(email) });
      return true;
    },
  };
}
