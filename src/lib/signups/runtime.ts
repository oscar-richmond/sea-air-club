/**
 * Wires the sign-up handlers to the real environment for the API routes.
 * Rate limiters and the store live for as long as the server instance does.
 */
import type { APIContext } from 'astro';
import { readSignupEnv } from './env';
import { createExportFailureLimiter, type ExportDeps } from './export';
import { consoleLogger } from './log';
import { createStore, type SignupStore } from './store';
import { createSubscribeRateLimiter, type SubscribeDeps } from './subscribe';

const subscribeLimiter = createSubscribeRateLimiter();
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

export function subscribeDeps(context: APIContext): SubscribeDeps {
  const env = readSignupEnv();
  return {
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
