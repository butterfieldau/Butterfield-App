import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';

/**
 * Log in via the API and inject the JWT + user object directly into
 * localStorage, then navigate to the target screen.
 * AsyncStorage on React Native Web maps 1:1 to window.localStorage.
 */
async function loginAndGoTo(page: Page, email: string, screenPath: string) {
  // 1. Call the API login endpoint
  const res = await page.request.post(`${BASE_URL}/api/auth/staff-login`, {
    data: { email, password: 'Demo1234!' },
  });
  const body = await res.json();
  const { token, user } = body as { token: string; user: Record<string, unknown> };

  // 2. Load the root first so we have a same-origin context for localStorage
  await page.goto('/');
  await page.waitForTimeout(5_000);   // wait for the JS bundle to hydrate

  // 3. Inject auth into localStorage (React Native Web AsyncStorage store)
  await page.evaluate(
    ([tok, usr]) => {
      localStorage.setItem('@butterfield_token', tok);
      localStorage.setItem('@butterfield_user', usr);
    },
    [token, JSON.stringify(user)],
  );

  // 4. Navigate directly to the target screen — avoids clicking hidden tab elements
  await page.goto(screenPath);
  await page.waitForTimeout(6_000);  // wait for portal to render

  // 5. Scroll to reveal all content
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
}

test.describe('Director More screen — section visibility', () => {
  // Raise per-test timeout; the Expo web app needs time to hydrate
  test.setTimeout(120_000);

  test('director sees all five category sections and director-only items', async ({ page }) => {
    await loginAndGoTo(page, 'director@demo.com', '/(director)/more');

    // Section headers — stored as cat.label.toUpperCase() in more.tsx
    await expect(page.locator('text=WHOLESALE').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=OPERATIONS').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=STAFF').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=SALES & MARKETING').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=SYSTEM').first()).toBeVisible({ timeout: 5_000 });

    // Director Vault gold card (only shown when isDirector=true)
    await expect(page.locator('text=Director Vault').first()).toBeVisible({ timeout: 5_000 });

    // Director-only security items inside the System section
    await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Login History').first()).toBeVisible({ timeout: 5_000 });

    // Sign Out is always present
    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 5_000 });
  });

  test('manager does not see director-only Vault, Audit Log, or Login History', async ({ page }) => {
    await loginAndGoTo(page, 'manager@demo.com', '/(director)/more');

    // Sign Out must always appear for any logged-in user
    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 10_000 });

    // Director-only items must be absent from the DOM for a manager
    const vaultCount = await page.locator('text=Director Vault').count();
    expect(vaultCount).toBe(0);

    const auditCount = await page.locator('text=Audit Log').count();
    expect(auditCount).toBe(0);

    const histCount = await page.locator('text=Login History').count();
    expect(histCount).toBe(0);
  });
});
