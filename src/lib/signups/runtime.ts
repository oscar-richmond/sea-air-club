/**
 * Wires the sign-up handlers to the real environment for the API routes.
 * Rate limiters and the store live for as long as the server instance does.
 */
import type { APIContext } from 'astro';
import { parseRecipients, senderForEnvironment, type EmailSender } from '@/lib/email/resend';
import type { DigestDeps } from './digest';
import { createWelcomeHook } from './welcome';
import { readSignupEnv } from './env';
import { createExportFailureLimiter, type ExportDeps } from './export';
import { consoleLogger } from './log';
import { createRateLimiter } from './rate-limit';
import { createStore, type SignupStore } from './store';
import { createSubscribeRateLimiter, type SubscribeDeps } from './subscribe';

// The local dev server (and the end-to-end tests that run against it) all come from one
// address, so the per-IP limit is relaxed there. Production uses the real limit.
const subscribeLimiter = import.meta.env.DEV
  ? createRateLimiter({ limit: 1000, windowMs: 60_000 })
  : createSubscribeRateLimiter();
const exportFailureLimiter = createExportFailureLimiter();
let store: SignupStore | undefined;

function getStore(): SignupStore {
  if (!store) {
    const env = readSignupEnv();
    store = createStore(
      { store: env.store, blobToken: env.blobToken, vercelEnv: env.vercelEnv },
      consoleLogger,
    );
  }
  return store;
}

/** `clientAddress` throws on some hosts when unknown; that's fine, it's only a fallback. */
function clientAddressOf(context: APIContext): string | null {
  try {
    return context.clientAddress ?? null;
  } catch {
    return null;
  }
}

/** Only the production deployment sends email; previews and local runs never do. */
function emailSender(env: { resendApiKey: string | undefined; vercelEnv: string | undefined }): EmailSender | null {
  return senderForEnvironment(env.resendApiKey, env.vercelEnv);
}

/** The site's own address, for links in emails. */
const siteUrl = (): string => import.meta.env.SITE ?? 'https://seaairclub.co.uk';

export function subscribeDeps(context: APIContext): SubscribeDeps {
  const env = readSignupEnv();
  return {
    welcome: createWelcomeHook(
      emailSender(env),
      { from: env.welcomeFrom, replyTo: env.welcomeReplyTo, siteUrl: siteUrl() },
      consoleLogger,
    ),
    getStore,
    rateLimiter: subscribeLimiter,
    webhook: { url: env.webhookUrl, secret: env.webhookSecret },
    logger: consoleLogger,
    allowLocalhostOrigin: import.meta.env.DEV,
    clientAddress: clientAddressOf(context),
  };
}

export function exportDeps(context: APIContext): ExportDeps {
  return {
    getStore,
    adminPassword: readSignupEnv().adminPassword,
    failureLimiter: exportFailureLimiter,
    logger: consoleLogger,
    clientAddress: clientAddressOf(context),
  };
}

export function digestDeps(): DigestDeps {
  const env = readSignupEnv();
  return {
    getStore,
    cronSecret: env.cronSecret,
    sender: emailSender(env),
    to: parseRecipients(env.digestTo),
    from: env.digestFrom,
    siteUrl: siteUrl(),
    logger: consoleLogger,
  };
}
