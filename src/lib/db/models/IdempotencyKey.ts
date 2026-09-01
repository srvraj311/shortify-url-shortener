import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Idempotency store (Plan §13, §27, §71). A client sends `Idempotency-Key` on
 * unsafe writes; the first request's response is replayed for duplicates.
 */
const IdempotencyKeySchema = new Schema(
  {
    scope: { type: String, required: true }, // e.g. "POST /api/v1/urls"
    key: { type: String, required: true },
    ownerId: { type: String, required: true }, // userId | ipHash | apiKeyId
    requestHash: { type: String, required: true }, // guards key reuse w/ different body
    status: { type: String, enum: ["IN_PROGRESS", "COMPLETED"], default: "IN_PROGRESS" },
    statusCode: { type: Number, default: null },
    response: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { collection: "idempotency_keys" },
);

IdempotencyKeySchema.index({ scope: 1, ownerId: 1, key: 1 }, { unique: true });
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyKeyDoc = InferSchemaType<typeof IdempotencyKeySchema> & { _id: string };
export const IdempotencyKey: Model<IdempotencyKeyDoc> =
  (models.IdempotencyKey as Model<IdempotencyKeyDoc>) ||
  model<IdempotencyKeyDoc>("IdempotencyKey", IdempotencyKeySchema);
