/**
 * Customer login email changes — API-level integration coverage.
 *
 * This suite creates isolated records and is skipped when the local API is not
 * running. It verifies the canonical users row, login behavior, role guard,
 * validation errors, collision handling, and replacement JWT claims.
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, customerProfilesTable, mobileSessionsTable, usersTable } from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';

const API_BASE = 'http://localhost:80/api';
const TEST_PASSWORD = 'EmailChange123!';
const suffix = randomUUID().slice(0, 10);
const originalEmail = `email-change-${suffix}@example.test`;
const duplicateEmail = `email-change-taken-${suffix}@example.test`;
const normalizedEmail = `email-change-new-${suffix}@example.test`;
const createdUserIds: string[] = [];

async function isServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/products`, { signal: AbortSignal.timeout(4_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

const serverAvailable = await isServerUp();

async function login(email: string, password = TEST_PASSWORD) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { response, body: await response.json() as Record<string, any> };
}

describe.skipIf(!serverAvailable)('Customer login email changes (integration)', () => {
  let customerToken = '';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    for (const email of [originalEmail, duplicateEmail]) {
      const id = randomUUID();
      createdUserIds.push(id);
      await db.insert(usersTable).values({
        id,
        email,
        passwordHash,
        role: 'customer',
        name: 'Email Change Test',
      });
    }

    // The seeded internal account gives the role-restriction check a valid
    // non-customer bearer credential without changing a staff record.
    await fetch(`${API_BASE}/auth/seed-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  });

  afterAll(async () => {
    if (!createdUserIds.length) return;
    await db.delete(mobileSessionsTable).where(inArray(mobileSessionsTable.userId, createdUserIds));
    await db.delete(customerProfilesTable).where(inArray(customerProfilesTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  });

  it('normalizes a customer email, renews credentials, and never revives a replaced token', async () => {
    const initialLogin = await login(originalEmail);
    expect(initialLogin.response.status).toBe(200);
    const previousRefreshToken = initialLogin.body.refreshToken;

    const updateResponse = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${initialLogin.body.token}`,
      },
      body: JSON.stringify({
        email: `  ${normalizedEmail.toUpperCase()}  `,
        name: 'Updated Email Customer',
      }),
    });
    const updated = await updateResponse.json() as Record<string, any>;

    expect(updateResponse.status).toBe(200);
    expect(updated.user.email).toBe(normalizedEmail);
    expect(updated.token).toEqual(expect.any(String));
    expect(updated.refreshToken).toEqual(expect.any(String));
    expect(updated.token).not.toBe(initialLogin.body.token);

    const claims = JSON.parse(Buffer.from(updated.token.split('.')[1], 'base64url').toString('utf8'));
    expect(claims.email).toBe(normalizedEmail);
    expect(claims.authVersion).toBe(1);

    const oldRefreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: previousRefreshToken }),
    });
    expect(oldRefreshResponse.status).toBe(401);

    const meResponse = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${updated.token}` },
    });
    const me = await meResponse.json() as { user: { email: string } };
    expect(me.user.email).toBe(normalizedEmail);

    const oldAccessResponse = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${initialLogin.body.token}` },
    });
    expect(oldAccessResponse.status).toBe(401);
    expect((await oldAccessResponse.json() as { code?: string }).code).toBe('SESSION_INVALID');

    const oldAccessUpdate = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${initialLogin.body.token}`,
      },
      body: JSON.stringify({ email: `blocked-second-change-${suffix}@example.test` }),
    });
    expect(oldAccessUpdate.status).toBe(401);

    const oldLoginAfterFirstChange = await login(originalEmail);
    expect(oldLoginAfterFirstChange.response.status).toBe(401);

    const newLoginAfterFirstChange = await login(normalizedEmail);
    expect(newLoginAfterFirstChange.response.status).toBe(200);

    const returnEmailResponse = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${updated.token}`,
      },
      body: JSON.stringify({ email: originalEmail }),
    });
    expect(returnEmailResponse.status).toBe(200);
    const returnedToOriginal = await returnEmailResponse.json() as Record<string, any>;

    const resurrectedAccess = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${initialLogin.body.token}` },
    });
    expect(resurrectedAccess.status).toBe(401);

    customerToken = returnedToOriginal.token;
  });

  it('rejects blank and malformed emails without changing the saved login', async () => {
    for (const email of ['', 'not-an-email']) {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as Record<string, any>;
      expect(response.status).toBe(400);
      expect(body.error).toMatch(/valid email/i);
    }

    const [user] = await db.select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, originalEmail));
    expect(user?.email).toBe(originalEmail);
  });

  it('rejects an already-registered email without changing the saved login', async () => {
    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ email: duplicateEmail }),
    });
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(409);
    expect(body.code).toBe('EMAIL_ALREADY_REGISTERED');

    const [user] = await db.select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, originalEmail));
    expect(user?.email).toBe(originalEmail);
  });

  it('rejects email changes from non-customer accounts', async () => {
    const staffLogin = await fetch(`${API_BASE}/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@demo.com', password: 'Demo1234!' }),
    });
    const staffSession = await staffLogin.json() as Record<string, any>;
    expect(staffLogin.status).toBe(200);

    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffSession.token}` },
      body: JSON.stringify({ email: `staff-blocked-${suffix}@example.test` }),
    });
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/only customer/i);
  });
});