import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureLoyaltySchemaReady } from "./lib/loyaltyIdentity.js";
import { startShiftReminderService } from "./lib/shiftReminderService.js";
import { db, productCategoriesTable } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Catch any unhandled rejections so they never crash the process
process.on('unhandledRejection', (reason: any) => {
  logger.error({ err: reason?.message ?? String(reason) }, 'Unhandled rejection — continuing');
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    await runMigrations({ databaseUrl, schema: "stripe" } as any);
    logger.info("Stripe schema ready");

    const { getStripeSync } = await import("./stripeClient.js");
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("Stripe webhook configured");

    stripeSync.syncBackfill().then(() => logger.info("Stripe backfill complete")).catch((err) => logger.error({ err }, "Stripe backfill error"));
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Stripe init skipped — integration not connected");
  }
}

// Pre-computed bcrypt hash for the master account password (rounds=12, verified)
const MASTER_EMAIL = 'info@thegraphic.com.au';
const MASTER_NAME  = 'The Graphic';
// Hash of "Pass*2160*" — change only by running bcrypt.hash() and replacing this value
const MASTER_HASH  = '$2b$12$LI2DmiVF1foB1/AlZ.hUb.B5G21/evlU8dy9gNHR3GpJY6VqgpjCO';

async function ensureMasterAccount() {
  try {
    const [existing] = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, MASTER_EMAIL));

    if (existing) {
      if (existing.role !== 'master') {
        await db.update(usersTable)
          .set({ role: 'master', passwordHash: MASTER_HASH, updatedAt: new Date() })
          .where(eq(usersTable.id, existing.id));
        logger.info({ email: MASTER_EMAIL }, 'Master account role updated');
      }
    } else {
      await db.insert(usersTable).values({
        id: randomUUID(),
        email: MASTER_EMAIL,
        passwordHash: MASTER_HASH,
        role: 'master',
        name: MASTER_NAME,
      });
      logger.info({ email: MASTER_EMAIL }, 'Master account created');
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'ensureMasterAccount skipped');
  }
}

const DEFAULT_CATEGORIES = [
  { id: 'cat_cookies',    name: 'Cookies',    slug: 'cookies',    sortOrder: 0,  showWholesale: true  },
  { id: 'cat_coffee',     name: 'Coffee',     slug: 'coffee',     sortOrder: 10, showWholesale: false },
  { id: 'cat_desserts',   name: 'Desserts',   slug: 'desserts',   sortOrder: 20, showWholesale: true  },
  { id: 'cat_bundles',    name: 'Bundles',    slug: 'bundles',    sortOrder: 30, showWholesale: true  },
  { id: 'cat_sandwiches', name: 'Sandwiches', slug: 'sandwiches', sortOrder: 40, showWholesale: false },
] as const;

async function ensureDefaultCategories() {
  try {
    const existing = await db.select({ id: productCategoriesTable.id }).from(productCategoriesTable);
    if (existing.length > 0) return;
    for (const cat of DEFAULT_CATEGORIES) {
      await db.insert(productCategoriesTable).values({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
        showPublic: true,
        showWholesale: cat.showWholesale,
        isPickupAvailable: true,
        isDeliveryAvailable: false,
      }).onConflictDoNothing();
    }
    logger.info('Default product categories seeded');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'ensureDefaultCategories skipped');
  }
}

// ── Start listening immediately so the port is bound before any async work ──
// Deployment health checks require the port to be up quickly. All DB/Stripe
// init runs in the background after the server is already accepting requests.
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Background init — errors are fully contained; the server is already up above
Promise.resolve()
  .then(() => ensureLoyaltySchemaReady())
  .then(() => ensureMasterAccount())
  .then(() => ensureDefaultCategories())
  .then(() => initStripe())
  .then(() => startShiftReminderService())
  .catch((err: any) => {
    logger.warn({ err: err?.message }, 'Background startup task failed');
  });
