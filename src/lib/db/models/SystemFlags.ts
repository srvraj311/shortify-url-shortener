import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Singleton document (_id: "global") holding runtime-tunable flags and the
 * failure-injection switches for the chaos lab (Plan §33, §55, §65).
 *
 * Redis is the primary store for these (fast, shared, no write to Mongo on the
 * hot path); this collection is the durable fallback when Redis is absent.
 */
const SystemFlagsSchema = new Schema(
  {
    _id: { type: String, default: "global" },
    featureOverrides: { type: Map, of: Boolean, default: {} },
    chaos: {
      redisDown: { type: Boolean, default: false },
      mongoDown: { type: Boolean, default: false },
      analyticsDown: { type: Boolean, default: false },
      queueDown: { type: Boolean, default: false },
      rateLimiterDown: { type: Boolean, default: false },
      extraLatencyMs: { type: Number, default: 0 },
      errorRate: { type: Number, default: 0 }, // 0..1
    },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: null },
  },
  { collection: "system_flags", _id: false },
);

export type SystemFlagsDoc = InferSchemaType<typeof SystemFlagsSchema> & { _id: string };
export const SystemFlags: Model<SystemFlagsDoc> =
  (models.SystemFlags as Model<SystemFlagsDoc>) ||
  model<SystemFlagsDoc>("SystemFlags", SystemFlagsSchema);
