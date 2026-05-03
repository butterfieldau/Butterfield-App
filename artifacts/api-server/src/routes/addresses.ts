import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, userAddressesTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const addresses = await db
    .select()
    .from(userAddressesTable)
    .where(eq(userAddressesTable.userId, req.user!.id))
    .orderBy(userAddressesTable.createdAt);
  return res.json({ data: addresses });
});

router.post('/', async (req, res) => {
  const { label, street, apt, suburb, postcode, state, isDefault } = req.body;
  if (!street || !suburb || !postcode) {
    return res.status(400).json({ error: 'Street, suburb and postcode are required' });
  }
  const id = randomUUID();
  if (isDefault) {
    await db
      .update(userAddressesTable)
      .set({ isDefault: false })
      .where(eq(userAddressesTable.userId, req.user!.id));
  }
  const [addr] = await db
    .insert(userAddressesTable)
    .values({
      id,
      userId: req.user!.id,
      label:     label?.trim()    || 'Home',
      street:    street.trim(),
      apt:       apt?.trim()      || null,
      suburb:    suburb.trim(),
      postcode:  postcode.trim(),
      state:     state?.trim()    || 'NSW',
      isDefault: isDefault ?? false,
    })
    .returning();
  return res.status(201).json({ data: addr });
});

router.patch('/:id', async (req, res) => {
  const [existing] = await db
    .select()
    .from(userAddressesTable)
    .where(and(eq(userAddressesTable.id, req.params.id), eq(userAddressesTable.userId, req.user!.id)));
  if (!existing) return res.status(404).json({ error: 'Address not found' });

  const { label, street, apt, suburb, postcode, state, isDefault } = req.body;
  if (isDefault) {
    await db
      .update(userAddressesTable)
      .set({ isDefault: false })
      .where(eq(userAddressesTable.userId, req.user!.id));
  }
  const [updated] = await db
    .update(userAddressesTable)
    .set({
      label:     label?.trim()    ?? existing.label,
      street:    street?.trim()   ?? existing.street,
      apt:       apt?.trim()      ?? existing.apt,
      suburb:    suburb?.trim()   ?? existing.suburb,
      postcode:  postcode?.trim() ?? existing.postcode,
      state:     state?.trim()    ?? existing.state,
      isDefault: isDefault ?? existing.isDefault,
      updatedAt: new Date(),
    })
    .where(eq(userAddressesTable.id, req.params.id))
    .returning();
  return res.json({ data: updated });
});

router.delete('/:id', async (req, res) => {
  const [existing] = await db
    .select()
    .from(userAddressesTable)
    .where(and(eq(userAddressesTable.id, req.params.id), eq(userAddressesTable.userId, req.user!.id)));
  if (!existing) return res.status(404).json({ error: 'Address not found' });
  await db.delete(userAddressesTable).where(eq(userAddressesTable.id, req.params.id));
  return res.json({ success: true });
});

export default router;
