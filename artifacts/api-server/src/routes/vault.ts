import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  db,
  vaultConfigTable,
  vaultRecipesTable,
  vaultIngredientsTable,
  vaultAccessLogTable,
} from '@workspace/db';
import { eq, desc, and, asc } from 'drizzle-orm';
import { requireRole, getSessionSecret } from '../middlewares/auth.js';

const router = Router();

const VAULT_JWT_EXPIRY = '2h';
const VAULT_SCOPE = 'vault';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 1000;
const MAX_UNLOCK_RATE = 10;

const unlockRateMap = new Map<string, { count: number; resetAt: number }>();

function checkUnlockRate(userId: string): boolean {
  const now = Date.now();
  const entry = unlockRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    unlockRateMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_UNLOCK_RATE) return false;
  entry.count++;
  return true;
}

function signVaultToken(userId: string): string {
  const secret = getSessionSecret();
  return jwt.sign({ sub: userId, scope: VAULT_SCOPE, vaultScope: true }, secret, {
    expiresIn: VAULT_JWT_EXPIRY,
  });
}

interface VaultTokenPayload {
  sub: string;
  scope: string;
  vaultScope: boolean;
}

export function requireVaultSession(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-vault-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    res.status(401).json({ error: 'Vault session required' });
    return;
  }
  try {
    const payload = jwt.verify(token, getSessionSecret()) as VaultTokenPayload;
    if (!payload.vaultScope || payload.scope !== VAULT_SCOPE) {
      res.status(401).json({ error: 'Invalid vault token' });
      return;
    }
    // Vault token must belong to the authenticated user — prevents cross-session reuse
    if (payload.sub !== req.user?.id) {
      res.status(401).json({ error: 'Vault token does not match authenticated user' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Vault token expired or invalid' });
  }
}

async function logVaultAccess(
  userId: string | undefined,
  action: string,
  recipeId?: string,
  ipAddress?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(vaultAccessLogTable).values({
    id: randomUUID(),
    userId: userId ?? null,
    action,
    recipeId: recipeId ?? null,
    ipAddress: ipAddress ?? null,
    metadata: metadata ?? null,
  });
}

async function getOrCreateVaultConfig() {
  const [existing] = await db.select().from(vaultConfigTable).where(eq(vaultConfigTable.id, 'singleton'));
  if (existing) return existing;
  const [created] = await db.insert(vaultConfigTable).values({ id: 'singleton' }).returning();
  return created;
}

const directorOnly = requireRole('director');

router.get('/status', directorOnly, async (req: Request, res: Response) => {
  const config = await getOrCreateVaultConfig();
  const now = new Date();
  const isLockedOut = config.lockoutExpiresAt ? config.lockoutExpiresAt > now : false;
  res.json({
    data: {
      isPinSet: !!config.pinHash,
      isLockedOut,
      lockoutExpiresAt: isLockedOut ? config.lockoutExpiresAt?.toISOString() ?? null : null,
      failedAttempts: config.failedAttempts,
    },
  });
});

router.post('/setup-pin', directorOnly, async (req: Request, res: Response) => {
  const { newPin, currentPin } = req.body as { newPin?: string; currentPin?: string };
  if (!newPin || typeof newPin !== 'string' || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    return;
  }

  const config = await getOrCreateVaultConfig();

  if (config.pinHash) {
    if (!currentPin) {
      res.status(400).json({ error: 'Current PIN required to change PIN' });
      return;
    }
    const match = await bcrypt.compare(currentPin, config.pinHash);
    if (!match) {
      await logVaultAccess(req.user!.id, 'failed_pin', undefined, req.ip);
      res.status(401).json({ error: 'Current PIN is incorrect' });
      return;
    }
  }

  const pinHash = await bcrypt.hash(newPin, 12);
  await db.update(vaultConfigTable)
    .set({
      pinHash,
      failedAttempts: 0,
      lockoutExpiresAt: null,
      pinChangedByUserId: req.user!.id,
      pinChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vaultConfigTable.id, 'singleton'));

  await logVaultAccess(req.user!.id, 'pin_changed', undefined, req.ip);
  res.json({ success: true });
});

router.post('/unlock', directorOnly, async (req: Request, res: Response) => {
  const { pin, biometricUnlock } = req.body as { pin?: string; biometricUnlock?: boolean };
  const userId = req.user!.id;

  if (!checkUnlockRate(userId)) {
    res.status(429).json({ error: 'Too many unlock attempts. Try again in a minute.' });
    return;
  }

  const config = await getOrCreateVaultConfig();

  if (!config.pinHash) {
    res.status(400).json({ error: 'PIN not set. Please set up your vault PIN first.' });
    return;
  }

  const now = new Date();
  if (config.lockoutExpiresAt && config.lockoutExpiresAt > now) {
    const remaining = Math.ceil((config.lockoutExpiresAt.getTime() - now.getTime()) / 1000);
    res.status(423).json({
      error: 'Vault is locked out',
      lockoutExpiresAt: config.lockoutExpiresAt.toISOString(),
      remainingSeconds: remaining,
    });
    return;
  }

  // If a previous lockout has now expired, reset the failure counter before evaluating this attempt.
  // Without this, the counter stays at MAX_FAILED_ATTEMPTS and the very next wrong PIN re-triggers lockout.
  const failedAttemptBaseline = (config.lockoutExpiresAt && config.lockoutExpiresAt <= now)
    ? 0
    : (config.failedAttempts ?? 0);

  if (failedAttemptBaseline === 0 && config.failedAttempts !== 0) {
    // Persist the reset so later reads see it
    await db.update(vaultConfigTable)
      .set({ failedAttempts: 0, lockoutExpiresAt: null, updatedAt: new Date() })
      .where(eq(vaultConfigTable.id, 'singleton'));
  }

  // Biometric auth is handled entirely client-side (device OS / FaceID).
  // The server always requires a PIN to issue a vault token — no server-side biometric shortcut.
  if (!pin || typeof pin !== 'string') {
    res.status(400).json({ error: 'PIN required' });
    return;
  }

  const match = await bcrypt.compare(pin, config.pinHash);
  if (!match) {
    const newFailed = failedAttemptBaseline + 1;
    const lockoutExpiresAt = newFailed >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_DURATION_MS)
      : null;
    await db.update(vaultConfigTable)
      .set({ failedAttempts: newFailed, lockoutExpiresAt, updatedAt: new Date() })
      .where(eq(vaultConfigTable.id, 'singleton'));

    await logVaultAccess(userId, 'failed_pin', undefined, String(req.ip ?? ''), { failedAttempts: newFailed });

    const remaining = MAX_FAILED_ATTEMPTS - newFailed;
    if (lockoutExpiresAt) {
      res.status(423).json({
        error: 'Too many wrong PINs. Vault is locked.',
        lockoutExpiresAt: lockoutExpiresAt.toISOString(),
        remainingSeconds: 30,
      });
    } else {
      res.status(401).json({
        error: 'Incorrect PIN',
        attemptsRemaining: remaining,
      });
    }
    return;
  }

  await db.update(vaultConfigTable)
    .set({ failedAttempts: 0, lockoutExpiresAt: null, updatedAt: new Date() })
    .where(eq(vaultConfigTable.id, 'singleton'));

  const vaultToken = signVaultToken(userId);
  const unlockMethod = (req.body as { biometricAssisted?: boolean }).biometricAssisted ? 'biometric_assisted' : 'pin';
  await logVaultAccess(userId, 'unlock', undefined, String(req.ip ?? ''), { method: unlockMethod });

  res.json({ vaultToken });
});

router.post('/change-pin', directorOnly, async (req: Request, res: Response) => {
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
  if (!currentPin || !newPin || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'Current PIN and 6-digit new PIN are required' });
    return;
  }

  const config = await getOrCreateVaultConfig();
  if (!config.pinHash) {
    res.status(400).json({ error: 'No PIN set yet' });
    return;
  }

  const match = await bcrypt.compare(currentPin, config.pinHash);
  if (!match) {
    await logVaultAccess(req.user!.id, 'failed_pin', undefined, req.ip);
    res.status(401).json({ error: 'Current PIN is incorrect' });
    return;
  }

  const pinHash = await bcrypt.hash(newPin, 12);
  await db.update(vaultConfigTable)
    .set({ pinHash, failedAttempts: 0, lockoutExpiresAt: null, pinChangedByUserId: req.user!.id, pinChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(vaultConfigTable.id, 'singleton'));

  await logVaultAccess(req.user!.id, 'pin_changed', undefined, req.ip);
  res.json({ success: true });
});

const vaultSession = [directorOnly, requireVaultSession];

router.get('/recipes', ...vaultSession, async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  let query = db.select().from(vaultRecipesTable).$dynamic();

  const conditions = [];
  if (category && category !== 'all') conditions.push(eq(vaultRecipesTable.category, category));
  if (status) conditions.push(eq(vaultRecipesTable.status, status));
  else conditions.push(eq(vaultRecipesTable.status, 'active'));

  if (conditions.length > 0) query = query.where(and(...conditions));

  const recipes = await query.orderBy(desc(vaultRecipesTable.updatedAt));

  const withCosts = await Promise.all(recipes.map(async (recipe) => {
    const ingredients = await db.select().from(vaultIngredientsTable)
      .where(eq(vaultIngredientsTable.recipeId, recipe.id))
      .orderBy(asc(vaultIngredientsTable.sortOrder));
    const totalBatchCostCents = ingredients.reduce((sum, ing) => {
      const qty = parseFloat(ing.quantity) || 0;
      return sum + Math.round(qty * ing.costCentsPerUnit);
    }, 0);
    return { ...recipe, totalBatchCostCents, ingredientCount: ingredients.length };
  }));

  await logVaultAccess(req.user!.id, 'view', undefined, req.ip);
  res.json({ data: withCosts });
});

router.post('/recipes', ...vaultSession, async (req: Request, res: Response) => {
  const { name, category, description, yieldCount, yieldUnit, prepTimeMin, bakeTimeMin, notes, ingredients } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Recipe name is required' });
    return;
  }

  const id = randomUUID();
  const [recipe] = await db.insert(vaultRecipesTable).values({
    id,
    name: name.trim(),
    category: category ?? 'cookies',
    description: description ?? null,
    yieldCount: yieldCount ?? 1,
    yieldUnit: yieldUnit ?? 'cookies',
    prepTimeMin: prepTimeMin ?? null,
    bakeTimeMin: bakeTimeMin ?? null,
    notes: notes ?? null,
    status: 'active',
    createdByUserId: req.user!.id,
    updatedByUserId: req.user!.id,
  }).returning();

  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const ingRows = ingredients.map((ing: any, idx: number) => ({
      id: randomUUID(),
      recipeId: id,
      name: ing.name ?? 'Ingredient',
      quantity: String(ing.quantity ?? '0'),
      unit: ing.unit ?? 'g',
      costCentsPerUnit: Math.round((ing.costCentsPerUnit ?? 0)),
      supplier: ing.supplier ?? null,
      notes: ing.notes ?? null,
      sortOrder: idx,
    }));
    await db.insert(vaultIngredientsTable).values(ingRows);
  }

  const insertedIngredients = await db.select().from(vaultIngredientsTable)
    .where(eq(vaultIngredientsTable.recipeId, id))
    .orderBy(asc(vaultIngredientsTable.sortOrder));

  await logVaultAccess(req.user!.id, 'create', id, String(req.ip ?? ''), { recipeName: name });
  res.status(201).json({ data: { ...recipe, ingredients: insertedIngredients } });
});

router.get('/recipes/:id', ...vaultSession, async (req: Request, res: Response) => {
  const id = String(req.params['id']);
  const [recipe] = await db.select().from(vaultRecipesTable).where(eq(vaultRecipesTable.id, id));
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ingredients = await db.select().from(vaultIngredientsTable)
    .where(eq(vaultIngredientsTable.recipeId, id))
    .orderBy(asc(vaultIngredientsTable.sortOrder));

  // Compute batch cost and cost-per-unit server-side so the client never has to do math
  const totalBatchCostCents = ingredients.reduce((sum, ing) => {
    const qty = parseFloat(ing.quantity) || 0;
    return sum + Math.round(qty * ing.costCentsPerUnit);
  }, 0);
  const costPerUnitCents = recipe.yieldCount > 0
    ? Math.round(totalBatchCostCents / recipe.yieldCount)
    : 0;

  await logVaultAccess(req.user!.id, 'view', id, String(req.ip ?? ''));
  res.json({ data: { ...recipe, ingredients, totalBatchCostCents, costPerUnitCents } });
});

router.patch('/recipes/:id', ...vaultSession, async (req: Request, res: Response) => {
  const id = String(req.params['id']);
  const [existing] = await db.select().from(vaultRecipesTable).where(eq(vaultRecipesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const { name, category, description, yieldCount, yieldUnit, prepTimeMin, bakeTimeMin, notes } = req.body;
  const [updated] = await db.update(vaultRecipesTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(yieldCount !== undefined ? { yieldCount } : {}),
      ...(yieldUnit !== undefined ? { yieldUnit } : {}),
      ...(prepTimeMin !== undefined ? { prepTimeMin } : {}),
      ...(bakeTimeMin !== undefined ? { bakeTimeMin } : {}),
      ...(notes !== undefined ? { notes } : {}),
      updatedByUserId: req.user!.id,
      updatedAt: new Date(),
    })
    .where(eq(vaultRecipesTable.id, id))
    .returning();

  await logVaultAccess(req.user!.id, 'edit', id, String(req.ip ?? ''));
  res.json({ data: updated });
});

router.patch('/recipes/:id/archive', ...vaultSession, async (req: Request, res: Response) => {
  const id = String(req.params['id']);
  const [existing] = await db.select().from(vaultRecipesTable).where(eq(vaultRecipesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const [updated] = await db.update(vaultRecipesTable)
    .set({ status: 'archived', updatedByUserId: req.user!.id, updatedAt: new Date() })
    .where(eq(vaultRecipesTable.id, id))
    .returning();

  await logVaultAccess(req.user!.id, 'archive', id, String(req.ip ?? ''));
  res.json({ data: updated });
});

router.post('/recipes/:id/ingredients', ...vaultSession, async (req: Request, res: Response) => {
  const id = String(req.params['id']);
  const [recipe] = await db.select().from(vaultRecipesTable).where(eq(vaultRecipesTable.id, id));
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const { name, quantity, unit, costCentsPerUnit, supplier, notes, sortOrder } = req.body;
  const [ingredient] = await db.insert(vaultIngredientsTable).values({
    id: randomUUID(),
    recipeId: id,
    name: name ?? 'Ingredient',
    quantity: String(quantity ?? '0'),
    unit: unit ?? 'g',
    costCentsPerUnit: Math.round(costCentsPerUnit ?? 0),
    supplier: supplier ?? null,
    notes: notes ?? null,
    sortOrder: sortOrder ?? 0,
  }).returning();

  await logVaultAccess(req.user!.id, 'edit', id, String(req.ip ?? ''), { action: 'add_ingredient' });
  res.status(201).json({ data: ingredient });
});

router.patch('/ingredients/:ingredientId', ...vaultSession, async (req: Request, res: Response) => {
  const ingredientId = String(req.params['ingredientId']);
  const [existing] = await db.select().from(vaultIngredientsTable).where(eq(vaultIngredientsTable.id, ingredientId));
  if (!existing) {
    res.status(404).json({ error: 'Ingredient not found' });
    return;
  }

  const { name, quantity, unit, costCentsPerUnit, supplier, notes, sortOrder } = req.body;
  const [updated] = await db.update(vaultIngredientsTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(quantity !== undefined ? { quantity: String(quantity) } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(costCentsPerUnit !== undefined ? { costCentsPerUnit: Math.round(costCentsPerUnit) } : {}),
      ...(supplier !== undefined ? { supplier } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(vaultIngredientsTable.id, ingredientId))
    .returning();

  await logVaultAccess(req.user!.id, 'edit_ingredient', existing.recipeId ?? undefined, String(req.ip ?? ''), { ingredientId });
  res.json({ data: updated });
});

router.delete('/ingredients/:ingredientId', ...vaultSession, async (req: Request, res: Response) => {
  const ingredientId = String(req.params['ingredientId']);
  const [existing] = await db.select().from(vaultIngredientsTable).where(eq(vaultIngredientsTable.id, ingredientId));
  await db.delete(vaultIngredientsTable).where(eq(vaultIngredientsTable.id, ingredientId));
  await logVaultAccess(req.user!.id, 'delete_ingredient', existing?.recipeId ?? undefined, String(req.ip ?? ''), { ingredientId });
  res.json({ success: true });
});

router.get('/access-log', ...vaultSession, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
  const offset = parseInt(String(req.query.offset ?? '0'));
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;

  let query = db.select().from(vaultAccessLogTable).$dynamic();
  if (action) query = query.where(eq(vaultAccessLogTable.action, action));

  const logs = await query
    .orderBy(desc(vaultAccessLogTable.createdAt))
    .limit(limit)
    .offset(offset);

  await logVaultAccess(req.user!.id, 'view_log', undefined, String(req.ip ?? ''));
  res.json({ data: logs });
});

export default router;
