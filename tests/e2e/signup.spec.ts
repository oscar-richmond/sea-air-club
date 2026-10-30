import { test, expect, testEmail } from './fixtures';

const dialog = (page: import('@playwright/test').Page) => page.locator('dialog[data-signup-dialog]');

test.describe('early access pop-up', () => {
  test('opens from the hero button and closes with Escape, returning focus', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('section[aria-labelledby="hero-title"] a[data-signup-open]');
    await trigger.click();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(/#join$/);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(page).not.toHaveURL(/#join/);
    await expect(trigger).toBeFocused();
  });

  test('every Join button opens the pop-up', async ({ page }) => {
    await page.goto('/');
    const triggers = page.locator('a[data-signup-open]');
    const count = await triggers.count();
    expect(count).toBeGreaterThanOrEqual(3); // hero, intro, early access
    for (let i = 0; i < count; i++) {
      await triggers.nth(i).scrollIntoViewIfNeeded();
      await triggers.nth(i).click();
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Close' }).first().click();
      await expect(dialog(page)).toBeHidden();
    }
  });

  test('/#join opens the pop-up directly', async ({ page }) => {
    await page.goto('/#join');
    await expect(dialog(page)).toBeVisible();
  });

  test('shows an error for an invalid email', async ({ page }) => {
    await page.goto('/#join');
    await dialog(page).getByLabel('Email').fill('not-an-email');
    await dialog(page).getByRole('button', { name: 'Join the early access list' }).click();
    await expect(dialog(page).getByText('Please enter a valid email address.')).toBeVisible();
    await expect(dialog(page).getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('signs up and thanks the visitor by name', async ({ page }) => {
    await page.goto('/?utm_source=postcard&utm_medium=print#join');
    await dialog(page).getByLabel('First name (optional)').fill('Alex');
    await dialog(page).getByLabel('Email').fill(testEmail('popup'));
    await page.waitForTimeout(1600); // humans take longer than the bot threshold
    const response = page.waitForResponse('**/api/subscribe');
    await dialog(page).getByRole('button', { name: 'Join the early access list' }).click();
    expect((await response).status()).toBe(200);
    await expect(dialog(page).getByRole('heading', { name: "You're on the list" })).toBeVisible();
    await expect(dialog(page)).toContainText('Thanks, Alex.');
    await dialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(dialog(page)).toBeHidden();
  });

  test('signing up twice still succeeds, and the pop-up resets in between', async ({ page }) => {
    const email = testEmail('repeat');
    await page.goto('/');
    for (let i = 0; i < 2; i++) {
      await page.locator('section[aria-labelledby="hero-title"] a[data-signup-open]').click();
      await expect(dialog(page).getByLabel('Email')).toHaveValue('');
      await dialog(page).getByLabel('Email').fill(email);
      await page.waitForTimeout(1600);
      await dialog(page).getByRole('button', { name: 'Join the early access list' }).click();
      await expect(dialog(page).getByRole('heading', { name: "You're on the list" })).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Done' }).click();
      await expect(dialog(page)).toBeHidden();
    }
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('Join buttons go to the sign-up page, which posts and confirms', async ({ page }) => {
    await page.goto('/');
    await page.locator('section[aria-labelledby="hero-title"] a[data-signup-open]').click();
    await expect(page).toHaveURL(/\/join$/);
    await page.getByLabel('Email').fill(testEmail('nojs'));
    await page.getByRole('button', { name: 'Join the early access list' }).click();
    await expect(page).toHaveURL(/\/join\/thanks$/);
    await expect(page.getByRole('heading', { name: "You're on the list" })).toBeVisible();
  });
});
