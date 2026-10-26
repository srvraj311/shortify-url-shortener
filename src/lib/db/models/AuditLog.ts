import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/** Append-only audit trail (Plan §40). Never contains secrets. */
const AuditLogSchema = new Schema(
  {
    actorId: { type: String, default: null }, // userId or "system"
    actorType: { type: String, enum: ["USER", "ADMIN", "SYSTEM", "ANON"], default: "USER" },
    action: { type: String, required: true },
    resourceType: { type: String, default: null },
    resourceId: { type: String, default: null },
    requestId: { type: String, default: null },
    ipHash: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { collection: "audit_logs" },
);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & { _id: string };
export const AuditLog: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) || model<AuditLogDoc>("AuditLog", AuditLogSchema);
