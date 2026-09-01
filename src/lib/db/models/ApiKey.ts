import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * API key (Plan §16). Raw key shown once at creation; only the hash is stored.
 * A short, non-secret prefix is kept for display ("sk_live_ab12…").
 */
const ApiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "REVOKED"], default: "ACTIVE" },
    scopes: { type: [String], default: ["urls:read", "urls:write"] },
    lastUsedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
  },
  { collection: "api_keys" },
);

ApiKeySchema.index({ userId: 1, status: 1 });

export type ApiKeyDoc = InferSchemaType<typeof ApiKeySchema> & { _id: string };
export const ApiKey: Model<ApiKeyDoc> =
  (models.ApiKey as Model<ApiKeyDoc>) || model<ApiKeyDoc>("ApiKey", ApiKeySchema);
