import type { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

export interface AuthTokenPayload extends AuthUser {
  authVersion: number;
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.SESSION_SECRET;
let generatedDevSecret: string | null = null;

export function getSessionSecret(): string {
  if (JWT_SECRET) return JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable must be set in production');
  }

  if (!generatedDevSecret) {
    generatedDevSecret = randomBytes(32).toString('hex');
  }

  return generatedDevSecret;
}

export const ACCESS_TOKEN_TTL: SignOptions['expiresIn'] = '15m';

export function signToken(payload: AuthTokenPayload, expiresIn: SignOptions['expiresIn'] = ACCESS_TOKEN_TTL): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  let payload: AuthTokenPayload;
  try {
    payload = jwt.verify(token, getSessionSecret()) as AuthTokenPayload;
  } catch (error) {
    const code = error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    res.status(401).json({ error: 'Invalid or expired token', code });
    return;
  }

  try {
    // The email claim doubles as a lightweight session generation. Changing a
    // login email immediately invalidates every bearer signed for the old one.
    if (!Number.isInteger(payload.authVersion)) {
      res.status(401).json({ error: 'Your session has been replaced. Please sign in again.', code: 'SESSION_INVALID' });
      return;
    }
    const [currentUser] = await db.select({
      email: usersTable.email,
      authVersion: usersTable.authVersion,
    })
      .from(usersTable)
      .where(eq(usersTable.id, payload.id));
    if (
      !currentUser ||
      currentUser.email !== payload.email ||
      currentUser.authVersion !== payload.authVersion
    ) {
      res.status(401).json({ error: 'Your session has been replaced. Please sign in again.', code: 'SESSION_INVALID' });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(503).json({ error: 'Unable to verify your session. Please try again.' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void requireAuth(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    });
  };
}
