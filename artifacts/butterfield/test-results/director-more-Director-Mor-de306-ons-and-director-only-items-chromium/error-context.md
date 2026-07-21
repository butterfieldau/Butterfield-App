# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: director-more.spec.ts >> Director More screen — section visibility >> director sees all four category sections and director-only items
- Location: e2e/director-more.spec.ts:94:7

# Error details

```
Error: director login failed: 502 — run POST /api/auth/seed-demo first

expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | 
  3   | const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';
  4   | 
  5   | // ── Helpers ──────────────────────────────────────────────────────────────────
  6   | 
  7   | /**
  8   |  * Inject a pre-obtained JWT + user blob into localStorage, then navigate to a
  9   |  * path and wait for the React app to render something meaningful.
  10  |  */
  11  | async function goToAs(page: Page, token: string, userJson: string, screenPath: string) {
  12  |   await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  13  |   await page.waitForLoadState('networkidle', { timeout: 90_000 });
  14  | 
  15  |   await page.evaluate(
  16  |     ([tok, usr]) => {
  17  |       localStorage.setItem('@butterfield_token', tok);
  18  |       localStorage.setItem('@butterfield_user', usr);
  19  |     },
  20  |     [token, userJson],
  21  |   );
  22  | 
  23  |   await page.goto(screenPath, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  24  |   await page.waitForLoadState('networkidle', { timeout: 90_000 });
  25  | 
  26  |   // Scroll to bottom so lazy-rendered sections are triggered.
  27  |   await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  28  |   await page.waitForTimeout(800);
  29  | }
  30  | 
  31  | /**
  32  |  * Tap a labelled row on the More screen.
  33  |  * `exact: true` uses full-string matching — prevents substring collisions
  34  |  * e.g. "Security Log" matching inside "Wholesale Security Logs".
  35  |  */
  36  | async function tapMoreRow(page: Page, label: string, exact = false) {
  37  |   await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  38  |   await page.waitForTimeout(800);
  39  | 
  40  |   const row = exact
  41  |     ? page.getByText(label, { exact: true }).first()
  42  |     : page.locator(`text=${label}`).first();
  43  |   await row.waitFor({ state: 'visible', timeout: 15_000 });
  44  |   await row.scrollIntoViewIfNeeded();
  45  |   await page.waitForTimeout(300);
  46  |   await row.click();
  47  | 
  48  |   await page.waitForLoadState('networkidle', { timeout: 30_000 });
  49  |   await page.waitForTimeout(1_500);
  50  | }
  51  | 
  52  | /**
  53  |  * Click the back button in any director screen header.
  54  |  * React Native Web renders accessibilityLabel as aria-label on the DOM element.
  55  |  * We match by [aria-label="Go back"] to avoid any role-resolution ambiguity.
  56  |  */
  57  | async function clickBackButton(page: Page) {
  58  |   const btn = page.locator('[aria-label="Go back"]').first();
  59  |   await btn.waitFor({ state: 'visible', timeout: 20_000 });
  60  |   await btn.click();
  61  |   await page.waitForLoadState('networkidle', { timeout: 30_000 });
  62  |   await page.waitForTimeout(1_500);
  63  | }
  64  | 
  65  | // ── Shared login tokens ───────────────────────────────────────────────────────
  66  | 
  67  | let _directorToken = '';
  68  | let _directorUserJson = '';
  69  | let _managerToken = '';
  70  | let _managerUserJson = '';
  71  | 
  72  | test.beforeAll(async ({ request }) => {
  73  |   const dirRes = await request.post(`${BASE_URL}/api/auth/staff-login`, {
  74  |     data: { email: 'director@demo.com', password: 'Demo1234!' },
  75  |   });
> 76  |   expect(dirRes.ok(), `director login failed: ${dirRes.status()} — run POST /api/auth/seed-demo first`).toBeTruthy();
      |                                                                                                         ^ Error: director login failed: 502 — run POST /api/auth/seed-demo first
  77  |   const { token: dirToken, user: dirUser } = await dirRes.json() as { token: string; user: unknown };
  78  |   _directorToken = dirToken;
  79  |   _directorUserJson = JSON.stringify(dirUser);
  80  | 
  81  |   const mgrRes = await request.post(`${BASE_URL}/api/auth/staff-login`, {
  82  |     data: { email: 'manager@demo.com', password: 'Demo1234!' },
  83  |   });
  84  |   expect(mgrRes.ok(), `manager login failed: ${mgrRes.status()} — run POST /api/auth/seed-demo first`).toBeTruthy();
  85  |   const { token: mgrToken, user: mgrUser } = await mgrRes.json() as { token: string; user: unknown };
  86  |   _managerToken = mgrToken;
  87  |   _managerUserJson = JSON.stringify(mgrUser);
  88  | });
  89  | 
  90  | // ──────────────────────────────────────────────────────────────────────────────
  91  | test.describe('Director More screen — section visibility', () => {
  92  |   test.setTimeout(240_000);
  93  | 
  94  |   test('director sees all four category sections and director-only items', async ({ page }) => {
  95  |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  96  | 
  97  |     await expect(page.locator('text=OPERATIONS').first()).toBeVisible({ timeout: 30_000 });
  98  |     await expect(page.locator('text=WHOLESALE').first()).toBeVisible({ timeout: 12_000 });
  99  |     await expect(page.locator('text=SALES & MARKETING').first()).toBeVisible({ timeout: 12_000 });
  100 |     await expect(page.locator('text=SYSTEM').first()).toBeVisible({ timeout: 12_000 });
  101 | 
  102 |     await expect(page.locator('text=Director Vault').first()).toBeVisible({ timeout: 12_000 });
  103 |     await expect(page.getByText('Security Log', { exact: true }).first()).toBeVisible({ timeout: 12_000 });
  104 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 12_000 });
  105 |   });
  106 | 
  107 |   test('manager does not see director-only Vault or Security Log', async ({ page }) => {
  108 |     await goToAs(page, _managerToken, _managerUserJson, '/(director)/more');
  109 | 
  110 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 30_000 });
  111 |     await expect(page.locator('text=Director Vault')).toHaveCount(0);
  112 |     await expect(page.getByText('Security Log', { exact: true })).toHaveCount(0);
  113 |   });
  114 | });
  115 | 
  116 | // ──────────────────────────────────────────────────────────────────────────────
  117 | test.describe('Director More — standalone screen navigation', () => {
  118 |   test.setTimeout(300_000);
  119 | 
  120 |   test('tapping Security Log from More opens screen with Audit Log and Login History tabs', async ({ page }) => {
  121 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  122 |     await tapMoreRow(page, 'Security Log', true);
  123 | 
  124 |     await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 20_000 });
  125 |     await expect(page.locator('text=Login History').first()).toBeVisible({ timeout: 12_000 });
  126 |   });
  127 | 
  128 |   test('back button on Staff Hub standalone screen returns to More', async ({ page }) => {
  129 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  130 |     await tapMoreRow(page, 'Staff Hub');
  131 | 
  132 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  133 | 
  134 |     await clickBackButton(page);
  135 | 
  136 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
  137 |     await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  138 |   });
  139 | 
  140 |   test('back button on Pricing Tiers standalone screen returns to More', async ({ page }) => {
  141 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  142 |     await tapMoreRow(page, 'Pricing Tiers');
  143 | 
  144 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  145 | 
  146 |     await clickBackButton(page);
  147 | 
  148 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
  149 |     await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  150 |   });
  151 | 
  152 |   test('back button on Settings standalone screen returns to More', async ({ page }) => {
  153 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  154 |     await tapMoreRow(page, 'Settings');
  155 | 
  156 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  157 | 
  158 |     await clickBackButton(page);
  159 | 
  160 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
  161 |     await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  162 |   });
  163 | 
  164 |   test('Director Vault card is visible for director and routes to director-vault screen', async ({ page }) => {
  165 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  166 | 
  167 |     const vaultCard = page.locator('text=Director Vault').first();
  168 |     await vaultCard.waitFor({ state: 'visible', timeout: 20_000 });
  169 |     await vaultCard.scrollIntoViewIfNeeded();
  170 |     await page.waitForTimeout(300);
  171 | 
  172 |     await expect(page.locator('text=DIRECTOR ONLY').first()).toBeVisible({ timeout: 12_000 });
  173 | 
  174 |     await vaultCard.click();
  175 |     await page.waitForLoadState('networkidle', { timeout: 30_000 });
  176 |     await page.waitForTimeout(1_500);
```