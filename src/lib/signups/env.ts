/**
 * The only module that reads sign-up settings from the environment. Everything else takes
 * them as arguments, so it can be unit tested without Astro. The schema for these
 * variables is in astro.config.mjs.
 */
import {
  ADMIN_EXPORT_PASSWORD,
  CRON_SECRET,
  RESEND_API_KEY,
  SIGNUP_DIGEST_FROM,
  SIGNUP_DIGEST_TO,
  SIGNUP_DIGEST_CC,
  WELCOME_EMAIL_FROM,
  WELCOME_EMAIL_REPLY_TO,
  SIGNUP_STORE,
  SIGNUP_WEBHOOK_SECRET,
  SIGNUP_WEBHOOK_URL,
  getSecret,
} from 'astro:env/server';
import type { SignupStoreKind } from './store/types';

export interface SignupEnv {
  store: SignupStoreKind | undefined;
  /** Added by Vercel when a Blob store is connected. Read by `@vercel/blob` too. */
  blobToken: string | undefined;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
  adminPassword: string | undefined;
  /** 'production', 'preview' or 'development' on Vercel; unset locally. */
  vercelEnv: string | undefined;
  resendApiKey: string | undefined;
  welcomeFrom: string | undefined;
  welcomeReplyTo: string | undefined;
  digestFrom: string | undefined;
  /** Comma-separated. */
  digestTo: string | undefined;
  /** Comma-separated. Copied in on the digest. */
  digestCc: string | undefined;
  cronSecret: string | undefined;
}

/**
 * SIGNUP_STORE is a public server variable, so Astro fixes its value at build time.
 * If it wasn't set during the build, look at the runtime environment as well.
 */
function storeSetting(): SignupStoreKind | undefined {
  const value = SIGNUP_STORE ?? getSecret('SIGNUP_STORE');
  return value === 'blob' || value === 'memory' ? value : undefined;
}

export function readSignupEnv(): SignupEnv {
  return {
    store: storeSetting(),
    // getSecret also sees values from a local .env file in dev; process.env is the deployed source.
    blobToken: getSecret('BLOB_READ_WRITE_TOKEN') || process.env.BLOB_READ_WRITE_TOKEN || undefined,
    webhookUrl: SIGNUP_WEBHOOK_URL || undefined,
    webhookSecret: SIGNUP_WEBHOOK_SECRET || undefined,
    adminPassword: ADMIN_EXPORT_PASSWORD || undefined,
    vercelEnv: process.env.VERCEL_ENV || undefined,
    resendApiKey: RESEND_API_KEY || undefined,
    welcomeFrom: WELCOME_EMAIL_FROM || undefined,
    welcomeReplyTo: WELCOME_EMAIL_REPLY_TO || undefined,
    digestFrom: SIGNUP_DIGEST_FROM || undefined,
    digestTo: SIGNUP_DIGEST_TO || undefined,
    digestCc: SIGNUP_DIGEST_CC || undefined,
    cronSecret: CRON_SECRET || undefined,
  };
}
