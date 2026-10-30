import type { SignupInput, SignupRecord, UpsertResult } from '../types';

export type SignupStoreKind = 'blob' | 'memory';

/**
 * Where sign-ups live. `blob` (Vercel Blob, private) in production, `memory` for local
 * development and tests. A database or a direct ResNexus destination would be another
 * implementation of this interface.
 */
export interface SignupStore {
  readonly kind: SignupStoreKind;
  /** Create the record for this email, or update it if the email is already on the list. */
  upsert(input: SignupInput, now?: Date): Promise<UpsertResult>;
  /** One record by email, or null. */
  get(email: string): Promise<SignupRecord | null>;
  /** Every record, in no particular order. */
  list(): Promise<SignupRecord[]>;
  /** Remove one person's record. True if there was one. */
  delete(email: string): Promise<boolean>;
}
