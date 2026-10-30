import { test as base, expect } from '@playwright/test';

/**
 * Standing rule: tests never reach the outside world. Every request that isn't to the
 * local dev server is blocked, so nothing can be emailed, stored or tracked for real.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    await page.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    );
    await use(page);
  },
});

export { expect };

/** Unique placeholder address per test run. Never use a real person's email. */
export const testEmail = (label: string) =>
  `test+${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
