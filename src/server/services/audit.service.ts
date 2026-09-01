import { AuditLog } from "@/lib/db/models";
import { getContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";

export interface AuditInput {
  actorId?: string | null;
  actorType?: "USER" | "ADMIN" | "SYSTEM" | "ANON";
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append an audit record (Plan §40). Best-effort: an audit write must never
 * fail the operation it is recording. Secrets are never passed in here.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const ctx = getContext();
    await AuditLog.create({
      actorId: input.actorId ?? ctx?.userId ?? null,
      actorType: input.actorType ?? (input.actorId || ctx?.userId ? "USER" : "ANON"),
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      requestId: ctx?.requestId ?? null,
      ipHash: input.ipHash ?? null,
      metadata: input.metadata ?? {},
      timestamp: new Date(),
    });
  } catch (err) {
    logger.warn("audit.write_failed", { action: input.action, err });
  }
}
