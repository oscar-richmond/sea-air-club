import { applySubmission, signupKey } from '../record';
import type { SignupRecord } from '../types';
import type { SignupStore } from './types';

/**
 * In-process store for local development and tests. Lost on restart, and each
 * serverless instance has its own copy, so never use it in production.
 */
export function createMemoryStore(records: Map<string, SignupRecord> = new Map()): SignupStore {
  return {
    kind: 'memory',
    async upsert(input, now = new Date()) {
      const key = signupKey(input.email);
      const existing = records.get(key) ?? null;
      const record = applySubmission(existing, input, now);
      records.set(key, structuredClone(record));
      return { record: structuredClone(record), created: existing === null };
    },
    async get(email) {
      const record = records.get(signupKey(email));
      return record ? structuredClone(record) : null;
    },
    async list() {
      return [...records.values()].map((r) => structuredClone(r));
    },
    async delete(email) {
      return records.delete(signupKey(email));
    },
  };
}

// One shared map per process, kept on globalThis so dev-server reloads don't wipe it.
const GLOBAL_KEY = Symbol.for('sea-air-club.signups.memory');

export function getSharedMemoryStore(): SignupStore {
  const g = globalThis as unknown as Record<symbol, Map<string, SignupRecord> | undefined>;
  const map = (g[GLOBAL_KEY] ??= new Map<string, SignupRecord>());
  return createMemoryStore(map);
}
