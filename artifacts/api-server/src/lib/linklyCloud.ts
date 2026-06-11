import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractLinklyErrorMessage(body: any, status?: number): string {
  const statusPrefix = status ? `Linkly returned HTTP ${status}` : 'Linkly returned an error';
  const candidates = [
    body?.Message, body?.message, body?.Detail, body?.detail,
    body?.title, body?.error, body?.Error,
    body?.rawText,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return `${statusPrefix}: ${c.trim()}`;
  }
  try {
    const raw = JSON.stringify(body);
    if (!raw || raw === '{}') return `${statusPrefix} with an empty response body. Check the Linkly environment, username/password, and pair code.`;
    const summary = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
    return `${statusPrefix}: ${summary}`;
  } catch {
    return `${statusPrefix} with an unreadable response body.`;
  }
}

export type LinklyEnvironment = 'sandbox' | 'production';
export type LinklyTransactionSource = 'pos' | 'shop_display' | 'management';
export type LinklyTransactionStatus = 'pending' | 'approved' | 'declined' | 'unknown';

type StoredLinklyConfig = {
  linkly_enabled: boolean | null;
  linkly_environment: LinklyEnvironment | null;
  linkly_username: string | null;
  linkly_password_encrypted: string | null;
  linkly_pairing_code: string | null;
  linkly_secret_encrypted: string | null;
  linkly_token_encrypted: string | null;
  linkly_token_expires_at: Date | string | null;
  linkly_terminal_id: string | null;
  linkly_pos_name: string | null;
  linkly_pos_version: string | null;
  linkly_pos_id: string | null;
  linkly_pos_vendor_id: string | null;
  linkly_last_pairing_at: Date | string | null;
};

export type LinklyPublicConfig = {
  linklyEnabled: boolean;
  environment: LinklyEnvironment;
  linklyUsername: string | null;
  linklyPairingCode: string | null;
  linklyTerminalId: string | null;
  linklyPosName: string;
  linklyPosVersion: string;
  linklyPosId: string | null;
  linklyPosVendorId: string | null;
  hasPassword: boolean;
  isPaired: boolean;
  tokenExpiresAt: string | null;
  lastPairedAt: string | null;
  linklyConfigComplete: boolean;
};

export type LinklyTransactionRecord = {
  sessionId: string;
  orderId?: string | null;
  source: LinklyTransactionSource;
  amountCents: number;
  amountSurchargeCents: number;
  txnRef: string;
  status: LinklyTransactionStatus;
  success: boolean;
  complete: boolean;
  responseCode: string | null;
  responseText: string;
  authCode: string | null;
  rrn: string | null;
  stan: string | null;
  catid: string | null;
  caid: string | null;
  rfn: string | null;
  ref: string | null;
  receiptText: string | null;
  receiptData: any;
  rawResponse: any;
};

export type LinklyManagementResult = {
  sessionId: string;
  requestType: 'settlement' | 'reprintreceipt';
  success: boolean;
  responseCode: string | null;
  responseText: string;
  settlementData?: string | null;
  receiptText?: string[] | null;
  rawResponse: any;
};

type StartPurchaseArgs = {
  userId: string;
  sessionId: string;
  amountCents: number;
  txnRef: string;
  operatorId: string;
  operatorName: string;
  orderId?: string | null;
  source: LinklyTransactionSource;
  notificationUrl?: string | null;
};

type LinklyManagementActionArgs = {
  userId: string;
  requestType: 'settlement' | 'reprintreceipt';
  requestPayload: any;
};

const DEFAULT_POS_NAME = 'Butterfield POS';
const DEFAULT_POS_VERSION = '1.3.1';
const TOKEN_REFRESH_BUFFER_MS = 90_000;
const FETCH_TIMEOUT_MS = 65_000;

function isRecoverableLinklyStatus(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 599);
}

function getEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set — cannot encrypt/decrypt Linkly credentials.');
  return createHash('sha256').update(secret).digest();
}

function encryptText(plain: string): string {
  const key = getEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${enc}`;
}

function decryptText(stored: string): string {
  const key = getEncKey();
  const sep = stored.indexOf(':');
  const iv = Buffer.from(stored.slice(0, sep), 'hex');
  const data = stored.slice(sep + 1);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let dec = decipher.update(data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normaliseEnvironment(value: unknown): LinklyEnvironment {
  return value === 'production' ? 'production' : 'sandbox';
}

function getBaseUrls(environment: LinklyEnvironment) {
  if (environment === 'production') {
    return {
      auth: 'https://auth.cloud.pceftpos.com',
      rest: 'https://rest.pos.cloud.pceftpos.com',
    };
  }
  return {
    auth: 'https://auth.sandbox.cloud.pceftpos.com',
    rest: 'https://rest.pos.sandbox.cloud.pceftpos.com',
  };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: any; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const rawText = await response.text().catch(() => '');
    let body: any = {};
    if (rawText.trim()) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = { rawText: rawText.trim().slice(0, 500) };
      }
    }
    return { ok: response.ok, status: response.status, body, timedOut: false };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 408, body: { error: 'Request timed out' }, timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureLinklySchemaReady() {
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_environment text NOT NULL DEFAULT 'sandbox';
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_secret_encrypted text;
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_token_encrypted text;
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_token_expires_at timestamptz;
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_pos_name text NOT NULL DEFAULT 'Butterfield POS';
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_pos_version text NOT NULL DEFAULT '1.3.1';
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_pos_id text;
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_pos_vendor_id text;
  `);
  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_last_pairing_at timestamptz;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS linkly_transactions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      order_id text,
      source text NOT NULL,
      session_id text NOT NULL UNIQUE,
      txn_ref text NOT NULL,
      amount_cents integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'pending',
      success boolean NOT NULL DEFAULT false,
      complete boolean NOT NULL DEFAULT false,
      response_code text,
      response_text text,
      auth_code text,
      rrn text,
      stan text,
      catid text,
      caid text,
      rfn text,
      ref text,
      receipt_text text,
      receipt_data jsonb,
      request_payload jsonb,
      raw_response jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS linkly_transactions_user_id_idx
    ON linkly_transactions (user_id, created_at DESC);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS linkly_transactions_order_id_idx
    ON linkly_transactions (order_id)
    WHERE order_id IS NOT NULL;
  `);
  await db.execute(sql`
    ALTER TABLE linkly_transactions
    ADD COLUMN IF NOT EXISTS amount_surcharge_cents integer NOT NULL DEFAULT 0;
  `);
}

async function getStoredConfig(userId: string): Promise<StoredLinklyConfig | null> {
  await ensureLinklySchemaReady();
  const result = await db.execute(sql`
    SELECT
      linkly_enabled,
      linkly_environment,
      linkly_username,
      linkly_password_encrypted,
      linkly_pairing_code,
      linkly_secret_encrypted,
      linkly_token_encrypted,
      linkly_token_expires_at,
      linkly_terminal_id,
      linkly_pos_name,
      linkly_pos_version,
      linkly_pos_id,
      linkly_pos_vendor_id,
      linkly_last_pairing_at
    FROM shop_display_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  return ((result as any).rows?.[0] ?? (result as any)[0] ?? null) as StoredLinklyConfig | null;
}

export async function getLinklyPublicConfig(userId: string): Promise<LinklyPublicConfig> {
  const row = await getStoredConfig(userId);
  const environment = normaliseEnvironment(row?.linkly_environment);
  const tokenExpiresAt = toIso(row?.linkly_token_expires_at ?? null);
  return {
    linklyEnabled: !!row?.linkly_enabled,
    environment,
    linklyUsername: row?.linkly_username ?? null,
    linklyPairingCode: row?.linkly_pairing_code ?? null,
    linklyTerminalId: row?.linkly_terminal_id ?? null,
    linklyPosName: row?.linkly_pos_name ?? DEFAULT_POS_NAME,
    linklyPosVersion: row?.linkly_pos_version ?? DEFAULT_POS_VERSION,
    linklyPosId: row?.linkly_pos_id ?? null,
    linklyPosVendorId: row?.linkly_pos_vendor_id ?? null,
    hasPassword: !!row?.linkly_password_encrypted,
    isPaired: !!row?.linkly_secret_encrypted,
    tokenExpiresAt,
    lastPairedAt: toIso(row?.linkly_last_pairing_at ?? null),
    linklyConfigComplete: !!(
      row?.linkly_username &&
      row?.linkly_password_encrypted &&
      row?.linkly_pairing_code &&
      row?.linkly_pos_id &&
      row?.linkly_pos_vendor_id
    ),
  };
}

export async function saveLinklyConfig(
  userId: string,
  input: {
    linklyEnabled?: boolean;
    environment?: LinklyEnvironment;
    linklyUsername?: string | null;
    linklyPassword?: string | null;
    linklyPairingCode?: string | null;
    linklyPosName?: string | null;
    linklyPosVersion?: string | null;
    linklyPosId?: string | null;
    linklyPosVendorId?: string | null;
  },
) {
  await ensureLinklySchemaReady();
  const encPassword = input.linklyPassword !== undefined && input.linklyPassword !== null && input.linklyPassword !== ''
    ? encryptText(String(input.linklyPassword))
    : input.linklyPassword === null
    ? null
    : undefined;
  const shouldResetPairing = [
    input.environment,
    input.linklyUsername,
    input.linklyPassword,
    input.linklyPairingCode,
    input.linklyPosId,
    input.linklyPosVendorId,
  ].some(v => v !== undefined);

  await db.execute(sql`
    INSERT INTO shop_display_profiles (
      user_id,
      permissions,
      linkly_enabled,
      linkly_environment,
      linkly_username,
      linkly_password_encrypted,
      linkly_pairing_code,
      linkly_pos_name,
      linkly_pos_version,
      linkly_pos_id,
      linkly_pos_vendor_id
    ) VALUES (
      ${userId},
      '[]',
      ${input.linklyEnabled ?? false},
      ${normaliseEnvironment(input.environment)},
      ${input.linklyUsername ?? null},
      ${encPassword ?? null},
      ${input.linklyPairingCode ?? null},
      ${input.linklyPosName?.trim() || DEFAULT_POS_NAME},
      ${input.linklyPosVersion?.trim() || DEFAULT_POS_VERSION},
      ${input.linklyPosId?.trim() || null},
      ${input.linklyPosVendorId?.trim() || null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      linkly_enabled = COALESCE(${input.linklyEnabled ?? null}, shop_display_profiles.linkly_enabled),
      linkly_environment = CASE WHEN ${input.environment !== undefined} THEN ${normaliseEnvironment(input.environment)} ELSE shop_display_profiles.linkly_environment END,
      linkly_username = CASE WHEN ${input.linklyUsername !== undefined} THEN ${input.linklyUsername ?? null} ELSE shop_display_profiles.linkly_username END,
      linkly_password_encrypted = CASE WHEN ${encPassword !== undefined} THEN ${encPassword} ELSE shop_display_profiles.linkly_password_encrypted END,
      linkly_pairing_code = CASE WHEN ${input.linklyPairingCode !== undefined} THEN ${input.linklyPairingCode ?? null} ELSE shop_display_profiles.linkly_pairing_code END,
      linkly_pos_name = CASE WHEN ${input.linklyPosName !== undefined} THEN ${input.linklyPosName?.trim() || DEFAULT_POS_NAME} ELSE shop_display_profiles.linkly_pos_name END,
      linkly_pos_version = CASE WHEN ${input.linklyPosVersion !== undefined} THEN ${input.linklyPosVersion?.trim() || DEFAULT_POS_VERSION} ELSE shop_display_profiles.linkly_pos_version END,
      linkly_pos_id = CASE WHEN ${input.linklyPosId !== undefined} THEN ${input.linklyPosId?.trim() || null} ELSE shop_display_profiles.linkly_pos_id END,
      linkly_pos_vendor_id = CASE WHEN ${input.linklyPosVendorId !== undefined} THEN ${input.linklyPosVendorId?.trim() || null} ELSE shop_display_profiles.linkly_pos_vendor_id END,
      linkly_secret_encrypted = CASE WHEN ${shouldResetPairing} THEN NULL ELSE shop_display_profiles.linkly_secret_encrypted END,
      linkly_token_encrypted = CASE WHEN ${shouldResetPairing} THEN NULL ELSE shop_display_profiles.linkly_token_encrypted END,
      linkly_token_expires_at = CASE WHEN ${shouldResetPairing} THEN NULL ELSE shop_display_profiles.linkly_token_expires_at END,
      linkly_terminal_id = CASE WHEN ${shouldResetPairing} THEN NULL ELSE shop_display_profiles.linkly_terminal_id END,
      updated_at = now()
  `);
}

function assertConfigComplete(row: StoredLinklyConfig | null): asserts row is StoredLinklyConfig {
  if (!row?.linkly_username || !row.linkly_password_encrypted || !row.linkly_pairing_code) {
    throw new Error('Linkly username, password, and pair code are required.');
  }
  if (!row.linkly_pos_id) {
    throw new Error('Linkly POS ID is required.');
  }
  if (!UUID_REGEX.test(row.linkly_pos_id)) {
    throw new Error(
      `POS ID must be a valid UUID (e.g. 2a6d4cb3-91b5-4b68-9e21-6b88d7d1a9ef). Current value is not a UUID.`,
    );
  }
  if (!row.linkly_pos_vendor_id) {
    throw new Error('Linkly POS Vendor ID is required.');
  }
  if (!UUID_REGEX.test(row.linkly_pos_vendor_id)) {
    throw new Error(
      `POS Vendor ID must be a valid UUID (e.g. 2a6d4cb3-91b5-4b68-9e21-6b88d7d1a9ef). Current value is not a UUID.`,
    );
  }
}

async function getDecryptedPassword(row: StoredLinklyConfig) {
  try {
    return decryptText(row.linkly_password_encrypted!);
  } catch {
    throw new Error('Failed to decrypt the saved Linkly password.');
  }
}

export async function pairLinklyPinPad(userId: string) {
  const row = await getStoredConfig(userId);
  assertConfigComplete(row);
  const password = await getDecryptedPassword(row);
  const env = normaliseEnvironment(row.linkly_environment);
  const { auth } = getBaseUrls(env);

  logger.info({
    env,
    hasUsername: Boolean(row.linkly_username),
    hasPassword: true,
    hasPairingCode: Boolean(row.linkly_pairing_code?.trim()),
    posIdIsUuid: UUID_REGEX.test(row.linkly_pos_id ?? ''),
    posVendorIdIsUuid: UUID_REGEX.test(row.linkly_pos_vendor_id ?? ''),
  }, 'Linkly pairing: pre-flight checks');

  const response = await fetchJson(`${auth}/v1/pairing/cloudpos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username: row.linkly_username,
      password,
      pairCode: row.linkly_pairing_code,
    }),
  });

  logger.info({
    httpStatus: response.status,
    bodyKeys: response.body && typeof response.body === 'object' ? Object.keys(response.body) : [],
    hasRawText: Boolean(response.body?.rawText),
  }, 'Linkly pairing: response received');

  if (!response.ok) {
    throw new Error(extractLinklyErrorMessage(response.body, response.status));
  }
  const secret = response.body?.secret ?? response.body?.Secret;
  if (!secret) throw new Error('Linkly pairing succeeded but no secret was returned.');
  const terminalId = response.body?.terminalId ?? response.body?.terminal_id ?? response.body?.TerminalId ?? null;
  await db.execute(sql`
    UPDATE shop_display_profiles
    SET
      linkly_secret_encrypted = ${encryptText(String(secret))},
      linkly_token_encrypted = NULL,
      linkly_token_expires_at = NULL,
      linkly_terminal_id = COALESCE(${terminalId}, linkly_terminal_id),
      linkly_last_pairing_at = now(),
      updated_at = now()
    WHERE user_id = ${userId}
  `);
  return { secret: String(secret), terminalId };
}

async function ensurePairedSecret(userId: string, row: StoredLinklyConfig) {
  if (row.linkly_secret_encrypted) {
    try {
      return decryptText(row.linkly_secret_encrypted);
    } catch {
      // fall through to re-pair
    }
  }
  const paired = await pairLinklyPinPad(userId);
  return paired.secret;
}

export async function getLinklyToken(userId: string, forceRefresh = false) {
  const row = await getStoredConfig(userId);
  assertConfigComplete(row);
  const expiresAt = row.linkly_token_expires_at ? new Date(row.linkly_token_expires_at).getTime() : 0;
  if (!forceRefresh && row.linkly_token_encrypted && expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    try {
      return decryptText(row.linkly_token_encrypted);
    } catch {
      // continue to refresh
    }
  }
  const secret = await ensurePairedSecret(userId, row);
  const { auth } = getBaseUrls(normaliseEnvironment(row.linkly_environment));
  const response = await fetchJson(`${auth}/v1/tokens/cloudpos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      secret,
      posName: row.linkly_pos_name ?? DEFAULT_POS_NAME,
      posVersion: row.linkly_pos_version ?? DEFAULT_POS_VERSION,
      posId: row.linkly_pos_id,
      posVendorId: row.linkly_pos_vendor_id,
    }),
  });
  if (!response.ok) {
    throw new Error(extractLinklyErrorMessage(response.body, response.status));
  }
  const token = response.body?.token ?? response.body?.Token;
  const expirySeconds = Number(response.body?.expirySeconds ?? response.body?.ExpirySeconds ?? 0);
  if (!token) throw new Error('Linkly token request succeeded but no token was returned.');
  const newExpiresAt = new Date(Date.now() + Math.max(60, expirySeconds || 60) * 1000);
  await db.execute(sql`
    UPDATE shop_display_profiles
    SET
      linkly_token_encrypted = ${encryptText(String(token))},
      linkly_token_expires_at = ${newExpiresAt},
      updated_at = now()
    WHERE user_id = ${userId}
  `);
  return String(token);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function buildReceiptText(response: any): string | null {
  return firstString(
    response?.ReceiptText,
    response?.receiptText,
    response?.MerchantReceipt,
    response?.CustomerReceipt,
    response?.Receipt,
  );
}

function parseTransactionPayload(
  sessionId: string,
  source: LinklyTransactionSource,
  orderId: string | null | undefined,
  amountCents: number,
  txnRef: string,
  payload: any,
): LinklyTransactionRecord {
  const response = payload?.Response ?? payload?.response ?? {};
  const responseCode = firstString(response?.ResponseCode, payload?.ResponseCode);
  const responseText = firstString(
    response?.ResponseText,
    payload?.ResponseText,
    payload?.displayMessage,
    payload?.message,
  ) ?? 'Waiting for card…';
  const success = response?.Success === true || payload?.Success === true || responseCode === '00';
  const explicitComplete = payload?.SessionComplete ?? payload?.Complete ?? payload?.TxnCompleted;
  const complete = typeof explicitComplete === 'boolean'
    ? explicitComplete
    : responseCode !== null || response?.Success === true || response?.Success === false;
  const status: LinklyTransactionStatus = !complete
    ? 'pending'
    : success && responseCode === '00'
    ? 'approved'
    : 'declined';
  const analysis = response?.PurchaseAnalysisData ?? payload?.PurchaseAnalysisData ?? {};
  const amountSurchargeCents = Math.max(0, Math.floor(Number(
    response?.AmountSurcharge ?? response?.amountSurcharge ??
    payload?.AmountSurcharge ?? payload?.amountSurcharge ?? 0,
  )));
  const receiptText = buildReceiptText(response) ?? buildReceiptText(payload);
  return {
    sessionId,
    orderId: orderId ?? null,
    source,
    amountCents,
    amountSurchargeCents,
    txnRef: firstString(response?.TxnRef, payload?.TxnRef, txnRef) ?? txnRef,
    status,
    success: success && responseCode === '00',
    complete,
    responseCode,
    responseText,
    authCode: firstString(response?.AuthCode, response?.authCode, payload?.AuthCode),
    rrn: firstString(response?.RRN, response?.rrn, payload?.RRN),
    stan: firstString(response?.Stan, response?.STAN, payload?.Stan),
    catid: firstString(response?.Catid, response?.CATID, payload?.Catid),
    caid: firstString(response?.Caid, response?.CAID, payload?.Caid),
    rfn: firstString(analysis?.RFN, analysis?.rfn),
    ref: firstString(analysis?.REF, analysis?.ref),
    receiptText,
    receiptData: {
      receiptText,
      merchantReceipt: response?.MerchantReceipt ?? null,
      customerReceipt: response?.CustomerReceipt ?? null,
    },
    rawResponse: payload,
  };
}

async function upsertTransaction(
  userId: string,
  record: LinklyTransactionRecord,
  requestPayload?: any,
) {
  await ensureLinklySchemaReady();
  await db.execute(sql`
    INSERT INTO linkly_transactions (
      id,
      user_id,
      order_id,
      source,
      session_id,
      txn_ref,
      amount_cents,
      amount_surcharge_cents,
      status,
      success,
      complete,
      response_code,
      response_text,
      auth_code,
      rrn,
      stan,
      catid,
      caid,
      rfn,
      ref,
      receipt_text,
      receipt_data,
      request_payload,
      raw_response,
      updated_at,
      completed_at
    ) VALUES (
      ${randomUUID()},
      ${userId},
      ${record.orderId ?? null},
      ${record.source},
      ${record.sessionId},
      ${record.txnRef},
      ${record.amountCents},
      ${record.amountSurchargeCents},
      ${record.status},
      ${record.success},
      ${record.complete},
      ${record.responseCode},
      ${record.responseText},
      ${record.authCode},
      ${record.rrn},
      ${record.stan},
      ${record.catid},
      ${record.caid},
      ${record.rfn},
      ${record.ref},
      ${record.receiptText},
      ${JSON.stringify(record.receiptData ?? null)}::jsonb,
      ${requestPayload ? JSON.stringify(requestPayload) : null}::jsonb,
      ${JSON.stringify(record.rawResponse ?? null)}::jsonb,
      now(),
      ${record.complete ? new Date() : null}
    )
    ON CONFLICT (session_id) DO UPDATE SET
      order_id = COALESCE(EXCLUDED.order_id, linkly_transactions.order_id),
      source = EXCLUDED.source,
      txn_ref = EXCLUDED.txn_ref,
      amount_cents = EXCLUDED.amount_cents,
      amount_surcharge_cents = CASE WHEN linkly_transactions.complete THEN linkly_transactions.amount_surcharge_cents ELSE EXCLUDED.amount_surcharge_cents END,
      status = CASE WHEN linkly_transactions.complete THEN linkly_transactions.status ELSE EXCLUDED.status END,
      success = CASE WHEN linkly_transactions.complete THEN linkly_transactions.success ELSE EXCLUDED.success END,
      complete = CASE WHEN linkly_transactions.complete THEN linkly_transactions.complete ELSE EXCLUDED.complete END,
      response_code = CASE WHEN linkly_transactions.complete THEN linkly_transactions.response_code ELSE EXCLUDED.response_code END,
      response_text = CASE WHEN linkly_transactions.complete THEN linkly_transactions.response_text ELSE EXCLUDED.response_text END,
      auth_code = CASE WHEN linkly_transactions.complete THEN linkly_transactions.auth_code ELSE EXCLUDED.auth_code END,
      rrn = CASE WHEN linkly_transactions.complete THEN linkly_transactions.rrn ELSE EXCLUDED.rrn END,
      stan = CASE WHEN linkly_transactions.complete THEN linkly_transactions.stan ELSE EXCLUDED.stan END,
      catid = CASE WHEN linkly_transactions.complete THEN linkly_transactions.catid ELSE EXCLUDED.catid END,
      caid = CASE WHEN linkly_transactions.complete THEN linkly_transactions.caid ELSE EXCLUDED.caid END,
      rfn = CASE WHEN linkly_transactions.complete THEN linkly_transactions.rfn ELSE EXCLUDED.rfn END,
      ref = CASE WHEN linkly_transactions.complete THEN linkly_transactions.ref ELSE EXCLUDED.ref END,
      receipt_text = CASE WHEN linkly_transactions.complete THEN linkly_transactions.receipt_text ELSE EXCLUDED.receipt_text END,
      receipt_data = CASE WHEN linkly_transactions.complete THEN linkly_transactions.receipt_data ELSE EXCLUDED.receipt_data END,
      request_payload = COALESCE(EXCLUDED.request_payload, linkly_transactions.request_payload),
      raw_response = COALESCE(EXCLUDED.raw_response, linkly_transactions.raw_response),
      updated_at = now(),
      completed_at = CASE WHEN EXCLUDED.complete THEN now() ELSE linkly_transactions.completed_at END
  `);
}

export async function attachLinklySessionToOrder(sessionId: string, orderId: string) {
  await ensureLinklySchemaReady();
  await db.execute(sql`
    UPDATE linkly_transactions
    SET order_id = ${orderId}, updated_at = now()
    WHERE session_id = ${sessionId}
  `);
}

export async function getStoredLinklyTransaction(sessionId: string) {
  await ensureLinklySchemaReady();
  const result = await db.execute(sql`
    SELECT
      session_id,
      order_id,
      source,
      amount_cents,
      amount_surcharge_cents,
      txn_ref,
      status,
      success,
      complete,
      response_code,
      response_text,
      auth_code,
      rrn,
      stan,
      catid,
      caid,
      rfn,
      ref,
      receipt_text,
      receipt_data,
      raw_response
    FROM linkly_transactions
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const row = ((result as any).rows?.[0] ?? (result as any)[0] ?? null) as any;
  if (!row) return null;
  return {
    sessionId: row.session_id,
    orderId: row.order_id ?? null,
    source: row.source as LinklyTransactionSource,
    amountCents: Number(row.amount_cents ?? 0),
    amountSurchargeCents: Number(row.amount_surcharge_cents ?? 0),
    txnRef: row.txn_ref,
    status: row.status as LinklyTransactionStatus,
    success: !!row.success,
    complete: !!row.complete,
    responseCode: row.response_code ?? null,
    responseText: row.response_text ?? '',
    authCode: row.auth_code ?? null,
    rrn: row.rrn ?? null,
    stan: row.stan ?? null,
    catid: row.catid ?? null,
    caid: row.caid ?? null,
    rfn: row.rfn ?? null,
    ref: row.ref ?? null,
    receiptText: row.receipt_text ?? null,
    receiptData: row.receipt_data ?? null,
    rawResponse: row.raw_response ?? null,
  } satisfies LinklyTransactionRecord;
}

export async function handleLinklyTransactionNotification(sessionId: string, payload: any) {
  await ensureLinklySchemaReady();
  const existing = await getStoredLinklyTransaction(sessionId);
  if (!existing) return null;
  if (existing.complete) return existing;
  const userId = await getTransactionUserId(sessionId);

  const parsed = parseTransactionPayload(
    sessionId,
    existing.source,
    existing.orderId,
    existing.amountCents,
    existing.txnRef,
    payload,
  );
  await upsertTransaction(userId, parsed);
  return parsed;
}

async function getTransactionUserId(sessionId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT user_id
    FROM linkly_transactions
    WHERE session_id = ${sessionId}
    LIMIT 1
  `);
  const row = ((result as any).rows?.[0] ?? (result as any)[0] ?? null) as { user_id?: string } | null;
  if (!row?.user_id) throw new Error('Linkly transaction session not found.');
  return row.user_id;
}

async function callLinklyTransaction(
  userId: string,
  environment: LinklyEnvironment,
  sessionId: string,
  requestPayload: any,
) {
  const token = await getLinklyToken(userId);
  const { rest } = getBaseUrls(environment);
  return fetchJson(`${rest}/v1/sessions/${sessionId}/transaction?async=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestPayload),
  });
}

async function callLinklyManagementAction(
  userId: string,
  environment: LinklyEnvironment,
  sessionId: string,
  requestType: 'settlement' | 'reprintreceipt',
  requestPayload: any,
) {
  const token = await getLinklyToken(userId);
  const { rest } = getBaseUrls(environment);
  return fetchJson(`${rest}/v1/sessions/${sessionId}/${requestType}?async=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestPayload),
  });
}

async function getRemoteTransaction(userId: string, environment: LinklyEnvironment, sessionId: string) {
  const token = await getLinklyToken(userId);
  const { rest } = getBaseUrls(environment);
  return fetchJson(`${rest}/v1/sessions/${sessionId}/transaction`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, 20_000);
}

async function runManagementAction({
  userId,
  requestType,
  requestPayload,
}: LinklyManagementActionArgs): Promise<LinklyManagementResult> {
  const row = await getStoredConfig(userId);
  assertConfigComplete(row);
  const environment = normaliseEnvironment(row.linkly_environment);
  const sessionId = randomUUID();
  const response = await callLinklyManagementAction(userId, environment, sessionId, requestType, requestPayload);
  if (!response.ok) {
    throw new Error(extractLinklyErrorMessage(response.body, response.status));
  }

  const payload = response.body ?? {};
  const bodyResponse = payload.Response ?? payload.response ?? {};
  const responseCode = firstString(bodyResponse?.ResponseCode, payload?.ResponseCode);
  const responseText = firstString(bodyResponse?.ResponseText, payload?.ResponseText) ?? 'No response text returned.';
  const receiptTextRaw = bodyResponse?.receiptText ?? bodyResponse?.ReceiptText ?? payload?.receiptText ?? payload?.ReceiptText ?? null;
  const receiptText = Array.isArray(receiptTextRaw)
    ? receiptTextRaw.map((line: unknown) => String(line))
    : typeof receiptTextRaw === 'string'
    ? receiptTextRaw.split('\n')
    : null;

  return {
    sessionId: firstString(payload?.SessionId, payload?.sessionId, sessionId) ?? sessionId,
    requestType,
    success: bodyResponse?.Success === true && responseCode === '00',
    responseCode,
    responseText,
    settlementData: firstString(bodyResponse?.SettlementData, payload?.SettlementData),
    receiptText,
    rawResponse: payload,
  };
}

export async function startPurchaseTransaction(args: StartPurchaseArgs) {
  const row = await getStoredConfig(args.userId);
  assertConfigComplete(row);
  const environment = normaliseEnvironment(row.linkly_environment);
  const requestPayload = {
    Request: {
      Merchant: '00',
      TxnType: 'P',
      AmtPurchase: Math.round(args.amountCents),
      TxnRef: args.txnRef,
      CurrencyCode: 'AUD',
      CutReceipt: '0',
      ReceiptAutoPrint: '0',
      Application: '00',
      PurchaseAnalysisData: {
        OPR: `${args.operatorId}|${args.operatorName}`,
        AMT: String(Math.round(args.amountCents)),
        PCM: '0000',
      },
    },
    ...(args.notificationUrl
      ? { Notification: { Uri: args.notificationUrl } }
      : {}),
  };

  const pendingRecord: LinklyTransactionRecord = {
    sessionId: args.sessionId,
    orderId: args.orderId ?? null,
    source: args.source,
    amountCents: Math.round(args.amountCents),
    amountSurchargeCents: 0,
    txnRef: args.txnRef,
    status: 'pending',
    success: false,
    complete: false,
    responseCode: null,
    responseText: 'Waiting for card…',
    authCode: null,
    rrn: null,
    stan: null,
    catid: null,
    caid: null,
    rfn: null,
    ref: null,
    receiptText: null,
    receiptData: null,
    rawResponse: null,
  };
  await upsertTransaction(args.userId, pendingRecord, requestPayload);

  try {
    const response = await callLinklyTransaction(args.userId, environment, args.sessionId, requestPayload);
    if (!response.ok) {
      if (isRecoverableLinklyStatus(response.status)) {
        return { sessionId: args.sessionId, txnRef: args.txnRef, amountCents: args.amountCents, recoveryRequired: true };
      }
      const message = extractLinklyErrorMessage(response.body, response.status);
      const failed = {
        ...pendingRecord,
        status: 'declined' as const,
        complete: true,
        responseText: message,
        responseCode: firstString(response.body?.Response?.ResponseCode, response.body?.ResponseCode),
        rawResponse: response.body,
      };
      await upsertTransaction(args.userId, failed, requestPayload);
      throw new Error(message);
    }
    const parsed = parseTransactionPayload(
      args.sessionId,
      args.source,
      args.orderId,
      Math.round(args.amountCents),
      args.txnRef,
      response.body,
    );
    const initialRecord = parsed.complete
      ? parsed
      : {
          ...pendingRecord,
          txnRef: parsed.txnRef,
          responseText:
            firstString(
              response.body?.Response?.ResponseText,
              response.body?.response?.ResponseText,
              response.body?.displayMessage,
              response.body?.message,
            ) ?? 'Sent to terminal. Waiting for card…',
          rawResponse: response.body,
        };
    await upsertTransaction(args.userId, initialRecord, requestPayload);
    return {
      sessionId: args.sessionId,
      txnRef: initialRecord.txnRef,
      amountCents: parsed.amountCents,
      recoveryRequired: false,
      immediateResult: initialRecord,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { sessionId: args.sessionId, txnRef: args.txnRef, amountCents: args.amountCents, recoveryRequired: true };
    }
    if (typeof error?.message === 'string' && /network|fetch/i.test(error.message)) {
      return { sessionId: args.sessionId, txnRef: args.txnRef, amountCents: args.amountCents, recoveryRequired: true };
    }
    throw error;
  }
}

export async function recoverOrPollTransaction(
  userId: string,
  sessionId: string,
) {
  const row = await getStoredConfig(userId);
  assertConfigComplete(row);
  const environment = normaliseEnvironment(row.linkly_environment);
  const existing = await getStoredLinklyTransaction(sessionId);
  if (existing?.complete) return existing;

  const response = await getRemoteTransaction(userId, environment, sessionId);
  if (response.status === 404) {
    const notSubmitted: LinklyTransactionRecord = {
      sessionId,
      orderId: existing?.orderId ?? null,
      source: existing?.source ?? 'management',
      amountCents: existing?.amountCents ?? 0,
      amountSurchargeCents: 0,
      txnRef: existing?.txnRef ?? sessionId.slice(0, 12).toUpperCase(),
      status: 'declined',
      success: false,
      complete: true,
      responseCode: '404',
      responseText: 'Transaction was not submitted. Please try again.',
      authCode: null,
      rrn: null,
      stan: null,
      catid: null,
      caid: null,
      rfn: null,
      ref: null,
      receiptText: null,
      receiptData: null,
      rawResponse: response.body,
    };
    await upsertTransaction(userId, notSubmitted);
    return notSubmitted;
  }
  if (response.status === 400) {
    const invalid: LinklyTransactionRecord = {
      sessionId,
      orderId: existing?.orderId ?? null,
      source: existing?.source ?? 'management',
      amountCents: existing?.amountCents ?? 0,
      amountSurchargeCents: 0,
      txnRef: existing?.txnRef ?? sessionId.slice(0, 12).toUpperCase(),
      status: 'declined',
      success: false,
      complete: true,
      responseCode: firstString(response.body?.Response?.ResponseCode, response.body?.ResponseCode, '400'),
      responseText: response.body?.message ?? response.body?.error ?? 'Invalid Linkly transaction request.',
      authCode: null,
      rrn: null,
      stan: null,
      catid: null,
      caid: null,
      rfn: null,
      ref: null,
      receiptText: null,
      receiptData: null,
      rawResponse: response.body,
    };
    await upsertTransaction(userId, invalid);
    return invalid;
  }
  if (!response.ok) {
    return existing ?? {
      sessionId,
      orderId: null,
      source: 'management',
      amountCents: 0,
      amountSurchargeCents: 0,
      txnRef: sessionId.slice(0, 12).toUpperCase(),
      status: 'pending',
      success: false,
      complete: false,
      responseCode: null,
      responseText: 'Checking terminal status…',
      authCode: null,
      rrn: null,
      stan: null,
      catid: null,
      caid: null,
      rfn: null,
      ref: null,
      receiptText: null,
      receiptData: null,
      rawResponse: response.body,
    };
  }
  const parsed = parseTransactionPayload(
    sessionId,
    existing?.source ?? 'management',
    existing?.orderId ?? null,
    existing?.amountCents ?? 0,
    existing?.txnRef ?? sessionId.slice(0, 12).toUpperCase(),
    response.body,
  );
  await upsertTransaction(userId, parsed);
  return parsed;
}

export async function runSettlementAction(
  userId: string,
  settlementType: 'S' | 'P',
) {
  return runManagementAction({
    userId,
    requestType: 'settlement',
    requestPayload: {
      Request: {
        Merchant: '00',
        SettlementType: settlementType,
        Application: '00',
        ReceiptAutoPrint: '0',
        CutReceipt: '0',
      },
    },
  });
}

export async function runReprintReceiptAction(
  userId: string,
  mode: 'pos' | 'pinpad',
) {
  return runManagementAction({
    userId,
    requestType: 'reprintreceipt',
    requestPayload: {
      Request: {
        Merchant: '00',
        Application: '00',
        ReceiptAutoPrint: mode === 'pinpad' ? '9' : '0',
        ReprintType: mode === 'pinpad' ? '1' : '2',
        CutReceipt: '0',
      },
    },
  });
}

/**
 * Send the Cancel key to the Linkly pinpad for the given session.
 * Linkly Cloud Key enum: 0=None 1=OK 2=Cancel 3=Yes 4=No 5=Authorise 6=Function
 */
export async function cancelTransaction(userId: string, sessionId: string): Promise<void> {
  let row: StoredLinklyConfig | null = null;
  try { row = await getStoredConfig(userId); } catch (err) {
    logger.warn({ err, sessionId }, 'Linkly cancel: could not load stored config');
    return;
  }
  if (!row?.linkly_secret) {
    logger.warn({ sessionId }, 'Linkly cancel: no config, skipping');
    return;
  }
  const environment = normaliseEnvironment(row.linkly_environment);
  let token: string;
  try { token = await getLinklyToken(userId); } catch (err) {
    logger.warn({ err, sessionId }, 'Linkly cancel: could not obtain token');
    return;
  }
  const { rest } = getBaseUrls(environment);
  const url = `${rest}/v1/sessions/${sessionId}/sendkey`;
  // Key 2 = Cancel in the Linkly Cloud Key enum
  const body = JSON.stringify({ Request: { Key: 2 } });
  logger.info({ sessionId, url, environment }, 'Linkly cancel: sending sendkey Key=2 (Cancel)');
  try {
    const result = await fetchJson(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    }, 8_000);
    logger.info({ sessionId, status: result.status, ok: result.ok, body: result.body }, 'Linkly cancel: sendkey response');
  } catch (err) {
    logger.warn({ err, sessionId }, 'Linkly cancel: sendkey threw');
  }
}
