import { request } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80';

/**
 * Global setup: seed demo accounts and clear rate-limit buckets so every
 * test run can log in cleanly, even after previous failed/retried runs.
 */
async function globalSetup() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    await ctx.post('/api/auth/seed-demo');
  } catch {
    // Non-fatal — tests that need demo accounts will fail with a clear message.
  } finally {
    await ctx.dispose();
  }
}

export default globalSetup;
