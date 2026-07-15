import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Inject a pre-obtained JWT + user blob into localStorage, then navigate to a
 * path and wait for the React app to render something meaningful.
 */
async function goToAs(page: Page, token: string, userJson: string, screenPath: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 90_000 });

  await page.evaluate(
    ([tok, usr]) => {
      localStorage.setItem('@butterfield_token', tok);
      localStorage.setItem('@butterfield_user', usr);
    },
    [token, userJson],
  );

  await page.goto(screenPath, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 90_000 });

  // Scroll to bottom so lazy-rendered sections are triggered.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
}

/**
 * Tap a labelled row on the More screen.
 * `exact: true` uses full-string matching — prevents substring collisions
 * e.g. "Security Log" matching inside "Wholesale Security Logs".
 */
async function tapMoreRow(page: Page, label: string, exact = false) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const row = exact
    ? page.getByText(label, { exact: true }).first()
    : page.locator(`text=${label}`).first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await row.click();

  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await page.waitForTimeout(1_500);
}

/**
 * Click the back button in any director screen header.
 * React Native Web renders accessibilityLabel as aria-label on the DOM element.
 * We match by [aria-label="Go back"] to avoid any role-resolution ambiguity.
 */
async function clickBackButton(page: Page) {
  const btn = page.locator('[aria-label="Go back"]').first();
  await btn.waitFor({ state: 'visible', timeout: 20_000 });
  await btn.click();
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await page.waitForTimeout(1_500);
}

// ── Shared login tokens ───────────────────────────────────────────────────────

let _directorToken = '';
let _directorUserJson = '';
let _managerToken = '';
let _managerUserJson = '';

test.beforeAll(async ({ request }) => {
  const dirRes = await request.post(`${BASE_URL}/api/auth/staff-login`, {
    data: { email: 'director@demo.com', password: 'Demo1234!' },
  });
  expect(dirRes.ok(), `director login failed: ${dirRes.status()} — run POST /api/auth/seed-demo first`).toBeTruthy();
  const { token: dirToken, user: dirUser } = await dirRes.json() as { token: string; user: unknown };
  _directorToken = dirToken;
  _directorUserJson = JSON.stringify(dirUser);

  const mgrRes = await request.post(`${BASE_URL}/api/auth/staff-login`, {
    data: { email: 'manager@demo.com', password: 'Demo1234!' },
  });
  expect(mgrRes.ok(), `manager login failed: ${mgrRes.status()} — run POST /api/auth/seed-demo first`).toBeTruthy();
  const { token: mgrToken, user: mgrUser } = await mgrRes.json() as { token: string; user: unknown };
  _managerToken = mgrToken;
  _managerUserJson = JSON.stringify(mgrUser);
});

// ──────────────────────────────────────────────────────────────────────────────
test.describe('Director More screen — section visibility', () => {
  test.setTimeout(240_000);

  test('director sees all four category sections and director-only items', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');

    await expect(page.locator('text=OPERATIONS').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('text=WHOLESALE').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('text=SALES & MARKETING').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('text=SYSTEM').first()).toBeVisible({ timeout: 12_000 });

    await expect(page.locator('text=Director Vault').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('Security Log', { exact: true }).first()).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 12_000 });
  });

  test('manager does not see director-only Vault or Security Log', async ({ page }) => {
    await goToAs(page, _managerToken, _managerUserJson, '/(director)/more');

    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('text=Director Vault')).toHaveCount(0);
    await expect(page.getByText('Security Log', { exact: true })).toHaveCount(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
test.describe('Director More — standalone screen navigation', () => {
  test.setTimeout(300_000);

  test('tapping Security Log from More opens screen with Audit Log and Login History tabs', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
    await tapMoreRow(page, 'Security Log', true);

    await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=Login History').first()).toBeVisible({ timeout: 12_000 });
  });

  test('back button on Staff Hub standalone screen returns to More', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
    await tapMoreRow(page, 'Staff Hub');

    await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });

    await clickBackButton(page);

    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  });

  test('back button on Pricing Tiers standalone screen returns to More', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
    await tapMoreRow(page, 'Pricing Tiers');

    await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });

    await clickBackButton(page);

    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  });

  test('back button on Settings standalone screen returns to More', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
    await tapMoreRow(page, 'Settings');

    await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });

    await clickBackButton(page);

    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  });

  test('Director Vault card is visible for director and routes to director-vault screen', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');

    const vaultCard = page.locator('text=Director Vault').first();
    await vaultCard.waitFor({ state: 'visible', timeout: 20_000 });
    await vaultCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await expect(page.locator('text=DIRECTOR ONLY').first()).toBeVisible({ timeout: 12_000 });

    await vaultCard.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(1_500);

    expect(page.url()).toContain('director-vault');
  });

  test('back button on Security Log screen returns to More', async ({ page }) => {
    await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
    await tapMoreRow(page, 'Security Log', true);

    await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 20_000 });

    await clickBackButton(page);

    await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  });
});
