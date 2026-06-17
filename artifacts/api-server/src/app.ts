import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import shareRouter from "./routes/share.js";
import { logger } from "./lib/logger.js";
import { WebhookHandlers } from "./webhookHandlers.js";
import { startDailySummaryJob } from "./lib/dailySummaryJob.js";
import { seedBirthdayCookieReward } from "./lib/birthdayRewardSeeder.js";

const app: Express = express();

function getAllowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const replitDomains = (process.env.REPLIT_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean)
    .map((domain) => `https://${domain}`);

  const publicDomain = process.env.EXPO_PUBLIC_DOMAIN ? [`https://${process.env.EXPO_PUBLIC_DOMAIN}`] : [];

  return Array.from(new Set([...configured, ...replitDomains, ...publicDomain]));
}

const allowedOrigins = getAllowedOrigins();

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;

  try {
    const parsed = new URL(origin);
    return allowedOrigins.includes(`${parsed.protocol}//${parsed.host}`);
  } catch {
    return false;
  }
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/s", shareRouter);
app.use("/api", router);

// Start background jobs (non-blocking; unref'd so they don't prevent graceful shutdown)
startDailySummaryJob();

// Seed required reward rows idempotently on boot (non-blocking)
void seedBirthdayCookieReward();

export default app;
