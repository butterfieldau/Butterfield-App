import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, mobileSessionsTable, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const API_BASE = 'http://localhost:80/api';
const password = 'RefreshRecovery123!';
const userId = randomUUID();
const email = `refresh-recovery-${userId}@example.test`;

async function isServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/products`, { signal: AbortSignal.timeout(4_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

const serverAvailable = await isServerUp();

async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.json() as Promise<{ token: string; refreshToken: string }>;
}

async function refresh(refreshToken: string) {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  return {
    response,
    body: await response.json() as { token?: string; refreshToken?: string; code?: string },
  };
}

describe.skipIf(!serverAvailable)('retry-safe refresh rotation', () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({
      id: userId,
      email,
      passwordHash: await bcrypt.hash(password, 4),
      role: 'customer',
      name: 'Refresh Recovery',
    });
  });

  afterAll(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it('returns one successor for a normal rotation and an immediate retry', async () => {
    const credentials = await login();
    const first = await refresh(credentials.refreshToken);
    expect(first.response.status).toBe(200);

    // This second request represents a client retry after the first response
    // reached the server but was lost before the app could persist it.
    const recovered = await refresh(credentials.refreshToken);
    expect(recovered.response.status).toBe(200);
    expect(recovered.body.refreshToken).toBe(first.body.refreshToken);
    expect(recovered.body.token).toBe(first.body.token);
  });

  it('gives simultaneous refreshes the same successor chain', async () => {
    const credentials = await login();
    const [first, second] = await Promise.all([
      refresh(credentials.refreshToken),
      refresh(credentials.refreshToken),
    ]);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(second.body.refreshToken).toBe(first.body.refreshToken);
  });

  it('rejects recovery after the bounded window', async () => {
    const credentials = await login();
    const first = await refresh(credentials.refreshToken);
    expect(first.response.status).toBe(200);
    const digest = createHash('sha256').update(credentials.refreshToken).digest('hex');
    await db.update(mobileSessionsTable)
      .set({ recoveryExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(mobileSessionsTable.tokenDigest, digest));

    const replay = await refresh(credentials.refreshToken);
    expect(replay.response.status).toBe(401);
    expect(replay.body.code).toBe('SESSION_INVALID');
    expect((await refresh(first.body.refreshToken!)).response.status).toBe(401);
  });

  it('does not recover a session after explicit logout', async () => {
    const credentials = await login();
    const rotated = await refresh(credentials.refreshToken);
    expect(rotated.response.status).toBe(200);
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotated.body.refreshToken }),
    });

    expect((await refresh(credentials.refreshToken)).response.status).toBe(401);
    expect((await refresh(rotated.body.refreshToken!)).response.status).toBe(401);
  });

  it('leaves no usable descendant when replay races successor rotation', async () => {
    const credentials = await login();
    const rotated = await refresh(credentials.refreshToken);
    const predecessorDigest = createHash('sha256').update(credentials.refreshToken).digest('hex');
    await db.update(mobileSessionsTable)
      .set({ recoveryExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(mobileSessionsTable.tokenDigest, predecessorDigest));

    const [replay, successorRotation] = await Promise.all([
      refresh(credentials.refreshToken),
      refresh(rotated.body.refreshToken!),
    ]);
    expect([replay.response.status, successorRotation.response.status]).toContain(401);
    if (successorRotation.body.refreshToken) {
      expect((await refresh(successorRotation.body.refreshToken)).response.status).toBe(401);
    }
  });

  it('leaves no usable descendant when logout races successor rotation', async () => {
    const credentials = await login();
    const rotated = await refresh(credentials.refreshToken);
    const [logoutResponse, successorRotation] = await Promise.all([
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: credentials.refreshToken }),
      }),
      refresh(rotated.body.refreshToken!),
    ]);
    expect(logoutResponse.status).toBe(200);
    if (successorRotation.body.refreshToken) {
      expect((await refresh(successorRotation.body.refreshToken)).response.status).toBe(401);
    }
    expect((await refresh(rotated.body.refreshToken!)).response.status).toBe(401);
  });

  it('rejects expired credentials and invalidated accounts', async () => {
    const expired = await login();
    const expiredDigest = createHash('sha256').update(expired.refreshToken).digest('hex');
    await db.update(mobileSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(mobileSessionsTable.tokenDigest, expiredDigest));
    expect((await refresh(expired.refreshToken)).response.status).toBe(401);

    const invalidated = await login();
    await db.update(usersTable).set({ status: 'suspended' }).where(eq(usersTable.id, userId));
    const rejection = await refresh(invalidated.refreshToken);
    expect(rejection.response.status).toBe(403);
    expect(rejection.body.code).toBe('ACCOUNT_SUSPENDED');
    await db.update(usersTable).set({ status: 'active' }).where(eq(usersTable.id, userId));
  });
});