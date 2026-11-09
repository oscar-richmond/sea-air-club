import { test, expect } from './fixtures';

test('home page renders the holding page sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Coming soon to Salcombe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A coastal escape' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two cabins' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Slow mornings/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Join the early access list/ }).first()).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Salcombe, Devon');
});

for (const width of [320, 375, 768, 1024, 1280, 1920, 2560]) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('every image has alt text', async ({ page }) => {
  await page.goto('/');
  const missing = await page.locator('img:not([alt])').count();
  expect(missing).toBe(0);
});
