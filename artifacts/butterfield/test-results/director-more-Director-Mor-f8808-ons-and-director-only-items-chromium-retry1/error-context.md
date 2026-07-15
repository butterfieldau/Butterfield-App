# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: director-more.spec.ts >> Director More screen — section visibility >> director sees all five category sections and director-only items
- Location: e2e/director-more.spec.ts:44:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Audit Log').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Audit Log').first()

```

```yaml
- text: More  Reports   Timesheets   Staff Hub  SALES & MARKETING  Discount Codes   Loyalty Tiers   Reward Catalogue   Banners   Push Notifications   Scheduled Notifications   Customer Segments   Feedback Inbox  OPERATIONS  Store Locations   Delivery Settings   Build a Box   Inventory   POS Devices  STAFF  Staff Accounts   Roster   Staff Hub  WHOLESALE  Wholesale Accounts   Invoice Management   Pricing Tiers   Delivery Settings   Wholesale Security Logs  SYSTEM  Settings   My Notifications   POS Thresholds   POS Transactions   Security Log   Director Vault DIRECTOR ONLY Secure recipe & cost repository   Sign Out director@demo.com Butterfield Director Portal
- tablist:
  - tab "  Home"
  - tab "  Orders"
  - tab "  People"
  - tab "  Products"
  - tab "  More" [selected]
- 'button "2 Internal React error: Expected static fl"':
  - text: "2 Internal React error: Expected static fl"
  - button:
    - img
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
> 58  |   const btn = page.locator('[aria-label="Go back"]').first();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
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
  76  |   expect(dirRes.ok(), `director login failed: ${dirRes.status()} — run POST /api/auth/seed-demo first`).toBeTruthy();
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
  94  |   test('director sees all five category sections and director-only items', async ({ page }) => {
  95  |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  96  | 
  97  |     await expect(page.locator('text=WHOLESALE').first()).toBeVisible({ timeout: 30_000 });
  98  |     await expect(page.locator('text=OPERATIONS').first()).toBeVisible({ timeout: 12_000 });
  99  |     await expect(page.locator('text=STAFF').first()).toBeVisible({ timeout: 12_000 });
  100 |     await expect(page.locator('text=SALES & MARKETING').first()).toBeVisible({ timeout: 12_000 });
  101 |     await expect(page.locator('text=SYSTEM').first()).toBeVisible({ timeout: 12_000 });
  102 | 
  103 |     await expect(page.locator('text=Director Vault').first()).toBeVisible({ timeout: 12_000 });
  104 |     await expect(page.getByText('Security Log', { exact: true }).first()).toBeVisible({ timeout: 12_000 });
  105 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 12_000 });
  106 |   });
  107 | 
  108 |   test('manager does not see director-only Vault or Security Log', async ({ page }) => {
  109 |     await goToAs(page, _managerToken, _managerUserJson, '/(director)/more');
  110 | 
  111 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 30_000 });
  112 |     await expect(page.locator('text=Director Vault')).toHaveCount(0);
  113 |     await expect(page.getByText('Security Log', { exact: true })).toHaveCount(0);
  114 |   });
  115 | });
  116 | 
  117 | // ──────────────────────────────────────────────────────────────────────────────
  118 | test.describe('Director More — standalone screen navigation', () => {
  119 |   test.setTimeout(300_000);
  120 | 
  121 |   test('tapping Security Log from More opens screen with Audit Log and Login History tabs', async ({ page }) => {
  122 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  123 |     await tapMoreRow(page, 'Security Log', true);
  124 | 
  125 |     await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 20_000 });
  126 |     await expect(page.locator('text=Login History').first()).toBeVisible({ timeout: 12_000 });
  127 |   });
  128 | 
  129 |   test('back button on Staff Hub standalone screen returns to More', async ({ page }) => {
  130 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  131 |     await tapMoreRow(page, 'Staff Hub');
  132 | 
  133 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  134 | 
  135 |     await clickBackButton(page);
  136 | 
  137 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
  138 |     await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  139 |   });
  140 | 
  141 |   test('back button on Pricing Tiers standalone screen returns to More', async ({ page }) => {
  142 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  143 |     await tapMoreRow(page, 'Pricing Tiers');
  144 | 
  145 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  146 | 
  147 |     await clickBackButton(page);
  148 | 
  149 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 20_000 });
  150 |     await expect(page.locator('text=More').first()).toBeVisible({ timeout: 12_000 });
  151 |   });
  152 | 
  153 |   test('back button on Settings standalone screen returns to More', async ({ page }) => {
  154 |     await goToAs(page, _directorToken, _directorUserJson, '/(director)/more');
  155 |     await tapMoreRow(page, 'Settings');
  156 | 
  157 |     await expect(page.locator('[aria-label="Go back"]').first()).toBeVisible({ timeout: 20_000 });
  158 | 
```