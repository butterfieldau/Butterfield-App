import { randomUUID } from "crypto";
import { db, auditLogsTable } from "@workspace/db";

export async function recordAuditLog(input: {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  description?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    description: input.description ?? null,
    beforeJson: input.before == null ? null : JSON.stringify(input.before),
    afterJson: input.after == null ? null : JSON.stringify(input.after),
  });
}
