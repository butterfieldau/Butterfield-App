import { Router } from 'express';
import {
  db, usersTable, managerProfilesTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// All manager routes require auth; permission checks done per-route
router.use(requireAuth);

function parsePerms(raw?: string | null): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

// Middleware to check manager role
router.use((req, res, next) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (req.user.role !== 'manager') { res.status(403).json({ error: 'Manager access only' }); return; }
  next();
});

// GET /api/manager/profile — returns manager profile + permissions
router.get('/profile', async (req, res) => {
  const [profile] = await db.select().from(managerProfilesTable)
    .where(eq(managerProfilesTable.userId, req.user!.id));
  if (!profile) {
    // Return empty profile instead of 404 so the layout doesn't break
    return res.json({ data: { userId: req.user!.id, permissions: [], name: req.user!.name, email: req.user!.email } });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  return res.json({
    data: {
      ...profile,
      permissions: parsePerms(profile.permissions),
      name: user?.name,
      email: user?.email,
    },
  });
});

export default router;
