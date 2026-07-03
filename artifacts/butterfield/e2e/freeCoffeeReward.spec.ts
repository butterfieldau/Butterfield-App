import { test, expect, Page } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';
const DB_URL = process.env.DATABASE_URL!;

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function getCustomerProfile(client: Client) {
  const { rows } = await client.query<{ free_coffee_rewards: number }>(
    `SELECT cp.free_coffee_rewards
     FROM customer_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE u.email = 'customer@demo.com'`,
  );
  return rows[0] ?? null;
}

async function seedFreeCoffeeReward(client: Client) {
  await client.query(
    `UPDATE customer_profiles
     SET free_coffee_rewards = 1, pay_at_pickup_enabled = true
     WHERE user_id = (SELECT id FROM users WHERE email = 'customer@demo.com')`,
  );
}

async function loginAsCustomer(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(3000);

  const demoBtn = page.getByText('Customer', { exact: true }).first();
  if (await demoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await demoBtn.click();
  } else {
    await page.getByPlaceholder(/email/i).fill('customer@demo.com');
    await page.getByPlaceholder(/password/i).fill('Demo1234!');
  }
  const loginBtn = page.getByRole('button', { name: /login|sign in/i }).first();
  await loginBtn.click();
  await page.waitForTimeout(4000);
}

async function addCoffeeToCart(page: Page) {
  const menuTab = page.getByText('Menu', { exact: true });
  await menuTab.click();
  await page.waitForTimeout(3000);

  const addBtn = page
    .locator('text=/flat white|cappuccino|latte|long black|macchiato|cortado/i')
    .first();
  const coffeeCard = addBtn.locator('..').locator('..');
  const plusBtn = coffeeCard.locator('[aria-label="Add to cart"], button').first();
  if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await plusBtn.click();
  } else {
    await addBtn.click();
    const addToCartBtn = page.getByRole('button', { name: /add to cart/i });
    await addToCartBtn.waitFor({ timeout: 5000 });
    await addToCartBtn.click();
  }
  await page.waitForTimeout(2000);
}

async function proceedToPaymentStep(page: Page) {
  const cartBar = page.getByText(/item|view cart/i).first();
  await cartBar.click();
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const continueShipping = page.getByText('Continue to shipping');
  await continueShipping.click();
  await page.waitForTimeout(3000);

  const scheduleLater = page.getByText(/schedule for later/i);
  await scheduleLater.click();
  await page.waitForTimeout(2000);

  const firstDate = page.locator('[role="button"], button, [aria-label]').filter({
    hasText: /^\d{1,2}$/,
  }).first();
  if (await firstDate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstDate.click();
    await page.waitForTimeout(1500);
  }

  const firstSlot = page.getByText(/^\d{1,2}:\d{2}\s*(AM|PM)?$/i).first();
  if (await firstSlot.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstSlot.click();
    await page.waitForTimeout(1000);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const continuePayment = page.getByText('Continue to payment');
  await continuePayment.click();
  await page.waitForTimeout(4000);
}

test.describe('Free Coffee Reward — checkout UI toggle', () => {
  test.beforeEach(async () => {
    await withDb(seedFreeCoffeeReward);
  });

  test('shows free coffee toggle in payment step when customer has reward and coffee in cart', async ({ page }) => {
    await loginAsCustomer(page);
    await addCoffeeToCart(page);
    await proceedToPaymentStep(page);

    await expect(page.getByText('Free coffee reward')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/available/i).first()).toBeVisible();
  });

  test('toggling ON reduces total by coffee price and order confirms with reward applied', async ({ page }) => {
    await loginAsCustomer(page);
    await addCoffeeToCart(page);
    await proceedToPaymentStep(page);

    const toggle = page.locator('[role="switch"]').first();
    const freeCoffeeSection = page.getByText('Free coffee reward');
    await freeCoffeeSection.waitFor({ timeout: 8000 });

    if (await toggle.getAttribute('aria-checked') !== 'true') {
      await toggle.click();
      await page.waitForTimeout(1000);
    }

    const totalText = page.getByText(/\$0\.00|total.*0/i).first();
    await expect(totalText).toBeVisible({ timeout: 5000 });

    await page.getByText(/pay at pickup/i).click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByText(/place order/i).click();
    await page.waitForTimeout(5000);

    await expect(
      page.getByText(/order.*confirm|BF\d{5}|free coffee|saved/i).first()
    ).toBeVisible({ timeout: 10000 });

    const profile = await withDb(getCustomerProfile);
    expect(profile?.free_coffee_rewards).toBe(0);
  });
});
