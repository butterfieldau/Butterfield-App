# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: director-more.spec.ts >> Director More screen — section visibility >> director sees all five category sections and director-only items
- Location: e2e/director-more.spec.ts:44:7

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForTimeout: Test timeout of 120000ms exceeded.
```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test';
  2  | 
  3  | const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';
  4  | 
  5  | /**
  6  |  * Log in via the API and inject the JWT + user object directly into
  7  |  * localStorage, then navigate to the target screen.
  8  |  * AsyncStorage on React Native Web maps 1:1 to window.localStorage.
  9  |  */
  10 | async function loginAndGoTo(page: Page, email: string, screenPath: string) {
  11 |   // 1. Call the API login endpoint
  12 |   const res = await page.request.post(`${BASE_URL}/api/auth/staff-login`, {
  13 |     data: { email, password: 'Demo1234!' },
  14 |   });
  15 |   const body = await res.json();
  16 |   const { token, user } = body as { token: string; user: Record<string, unknown> };
  17 | 
  18 |   // 2. Load the root first so we have a same-origin context for localStorage
  19 |   await page.goto('/');
  20 |   await page.waitForTimeout(5_000);   // wait for the JS bundle to hydrate
  21 | 
  22 |   // 3. Inject auth into localStorage (React Native Web AsyncStorage store)
  23 |   await page.evaluate(
  24 |     ([tok, usr]) => {
  25 |       localStorage.setItem('@butterfield_token', tok);
  26 |       localStorage.setItem('@butterfield_user', usr);
  27 |     },
  28 |     [token, JSON.stringify(user)],
  29 |   );
  30 | 
  31 |   // 4. Navigate directly to the target screen — avoids clicking hidden tab elements
  32 |   await page.goto(screenPath);
> 33 |   await page.waitForTimeout(6_000);  // wait for portal to render
     |              ^ Error: page.waitForTimeout: Test timeout of 120000ms exceeded.
  34 | 
  35 |   // 5. Scroll to reveal all content
  36 |   await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  37 |   await page.waitForTimeout(500);
  38 | }
  39 | 
  40 | test.describe('Director More screen — section visibility', () => {
  41 |   // Raise per-test timeout; the Expo web app needs time to hydrate
  42 |   test.setTimeout(120_000);
  43 | 
  44 |   test('director sees all five category sections and director-only items', async ({ page }) => {
  45 |     await loginAndGoTo(page, 'director@demo.com', '/(director)/more');
  46 | 
  47 |     // Section headers — stored as cat.label.toUpperCase() in more.tsx
  48 |     await expect(page.locator('text=WHOLESALE').first()).toBeVisible({ timeout: 10_000 });
  49 |     await expect(page.locator('text=OPERATIONS').first()).toBeVisible({ timeout: 5_000 });
  50 |     await expect(page.locator('text=STAFF').first()).toBeVisible({ timeout: 5_000 });
  51 |     await expect(page.locator('text=SALES & MARKETING').first()).toBeVisible({ timeout: 5_000 });
  52 |     await expect(page.locator('text=SYSTEM').first()).toBeVisible({ timeout: 5_000 });
  53 | 
  54 |     // Director Vault gold card (only shown when isDirector=true)
  55 |     await expect(page.locator('text=Director Vault').first()).toBeVisible({ timeout: 5_000 });
  56 | 
  57 |     // Director-only security items inside the System section
  58 |     await expect(page.locator('text=Audit Log').first()).toBeVisible({ timeout: 5_000 });
  59 |     await expect(page.locator('text=Login History').first()).toBeVisible({ timeout: 5_000 });
  60 | 
  61 |     // Sign Out is always present
  62 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 5_000 });
  63 |   });
  64 | 
  65 |   test('manager does not see director-only Vault, Audit Log, or Login History', async ({ page }) => {
  66 |     await loginAndGoTo(page, 'manager@demo.com', '/(director)/more');
  67 | 
  68 |     // Sign Out must always appear for any logged-in user
  69 |     await expect(page.locator('text=Sign Out').first()).toBeVisible({ timeout: 10_000 });
  70 | 
  71 |     // Director-only items must be absent from the DOM for a manager
  72 |     const vaultCount = await page.locator('text=Director Vault').count();
  73 |     expect(vaultCount).toBe(0);
  74 | 
  75 |     const auditCount = await page.locator('text=Audit Log').count();
  76 |     expect(auditCount).toBe(0);
  77 | 
  78 |     const histCount = await page.locator('text=Login History').count();
  79 |     expect(histCount).toBe(0);
  80 |   });
  81 | });
  82 | 
```