import type { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
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

export function signToken(payload: AuthUser, expiresIn: SignOptions['expiresIn'] = ACCESS_TOKEN_TTL): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getSessionSecret()) as AuthUser;
    req.user = payload;
    next();
  } catch (error) {
    const code = error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    res.status(401).json({ error: 'Invalid or expired token', code });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    });
  };
}
