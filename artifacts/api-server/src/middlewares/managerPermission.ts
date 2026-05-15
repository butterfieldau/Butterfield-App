import type { Request, Response, NextFunction } from 'express';
import { db, managerProfilesTable } from '@workspace/db';
import type { ManagerPermission } from '@workspace/db';
import { eq } from 'drizzle-orm';

function parsePerms(raw?: string | null): ManagerPermission[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as ManagerPermission[] : [];
  } catch { return []; }
}

async function loadManagerPermissions(userId: string): Promise<ManagerPermission[]> {
  const [profile] = await db
    .select({ permissions: managerProfilesTable.permissions })
    .from(managerProfilesTable)
    .where(eq(managerProfilesTable.userId, userId));
  return parsePerms(profile?.permissions);
}

/**
 * Middleware factory that passes directors and masters through unconditionally,
 * and requires the manager role to hold a specific named permission in their
 * manager_profiles.permissions array.  All other roles receive 403.
 */
export function requireManagerPermission(permission: ManagerPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.user.role === 'director' || req.user.role === 'master') {
      next();
      return;
    }
    if (req.user.role === 'manager') {
      const perms = await loadManagerPermissions(req.user.id);
      if (perms.includes(permission)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Forbidden: insufficient manager permissions' });
      return;
    }
    res.status(403).json({ error: 'Forbidden' });
  };
}

/**
 * Middleware that enforces per-path manager permissions using a resolver function.
 * The resolver receives (method, path) and returns either a required
 * ManagerPermission, 'director_only' (blocks managers entirely), or 'self_only'
 * (always allows managers through, but sets req.managerViewScope = 'self' | 'all'
 *  based on whether they hold the 'timesheets' permission).
 * Directors and masters always pass through; non-managers receive 403.
 */
export function requireManagerRoutePermission(
  resolver: (method: string, path: string) => ManagerPermission | 'director_only' | 'self_only',
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.user.role === 'director' || req.user.role === 'master') {
      next();
      return;
    }
    if (req.user.role === 'manager') {
      const required = resolver(req.method, req.path);
      if (required === 'director_only') {
        res.status(403).json({ error: 'Forbidden: director access only' });
        return;
      }
      const perms = await loadManagerPermissions(req.user.id);
      if (required === 'self_only') {
        // Always allow, but scope what data the handler returns.
        (req as any).managerViewScope = perms.includes('timesheets') ? 'all' : 'self';
        next();
        return;
      }
      if (perms.includes(required)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Forbidden: insufficient manager permissions' });
      return;
    }
    res.status(403).json({ error: 'Forbidden' });
  };
}
