import type { Logger } from '../types';
import { createBlobStore } from './blob';
import { getSharedMemoryStore } from './memory';
import type { SignupStore, SignupStoreKind } from './types';

export type { SignupStore, SignupStoreKind } from './types';
export { createMemoryStore } from './memory';
export { createBlobStore } from './blob';

export interface StoreSettings {
  /** SIGNUP_STORE. Unset means auto. */
  store?: SignupStoreKind | undefined;
  /** BLOB_READ_WRITE_TOKEN, if set. */
  blobToken?: string | undefined;
  /** VERCEL_ENV: 'production', 'preview' or 'development'. */
  vercelEnv?: string | undefined;
}

/** Which store to use: SIGNUP_STORE if set, otherwise Blob when a token exists, else memory. */
export function chooseStoreKind(settings: StoreSettings): SignupStoreKind {
  if (settings.store === 'blob' || settings.store === 'memory') return settings.store;
  return settings.blobToken ? 'blob' : 'memory';
}

export function createStore(settings: StoreSettings, logger: Logger): SignupStore {
  const kind = chooseStoreKind(settings);

  if (kind === 'memory' && settings.vercelEnv === 'production') {
    logger.error(
      '!!! SIGN-UPS ARE NOT BEING SAVED !!! The in-memory store is in use in production, so ' +
        'sign-ups vanish when this function instance stops. Connect a private Vercel Blob store ' +
        '(adds BLOB_READ_WRITE_TOKEN) and remove SIGNUP_STORE=memory. See docs/SIGNUPS.md.',
    );
  }
  if (kind === 'blob' && !settings.blobToken) {
    logger.error(
      'SIGNUP_STORE=blob but BLOB_READ_WRITE_TOKEN is not set: sign-ups will fail until the ' +
        'Blob store is connected to this project.',
    );
  }

  return kind === 'blob'
    ? createBlobStore({ ...(settings.blobToken ? { token: settings.blobToken } : {}), logger })
    : getSharedMemoryStore();
}
