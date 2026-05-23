import { randomUUID } from 'crypto';
import { auditLogsTable, db } from '@workspace/db';
import type { AuthUser } from '../middlewares/auth.js';

type AuditInput = {
  actor?: AuthUser | null;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

function serialize(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function recordAuditLog(input: AuditInput) {
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    reason: input.reason ?? null,
    beforeJson: serialize(input.before),
    afterJson: serialize(input.after),
    metadataJson: serialize(input.metadata),
  });
}
