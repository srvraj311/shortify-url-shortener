import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Core write model (Plan §8, §11).
 *
 * Lifecycle: ACTIVE -> DISABLED | EXPIRED | FLAGGED. Only ACTIVE redirects.
 * `version` powers optimistic concurrency (Plan §42).
 */
const UrlSchema = new Schema(
  {
    shortCode: { type: String, required: true },
    originalUrl: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    domain: { type: String, required: true },

    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByIpHash: { type: String, default: null },

    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED", "EXPIRED", "FLAGGED"],
      default: "ACTIVE",
    },
    visibility: { type: String, enum: ["PUBLIC", "PRIVATE"], default: "PUBLIC" },
    type: { type: String, enum: ["RANDOM", "ALIAS"], default: "RANDOM" },
    customAlias: { type: String, default: null },

    title: { type: String, default: null },
    tags: { type: [String], default: [] },

    expiresAt: { type: Date, default: null },
    clickCount: { type: Number, default: 0 },

    // Abuse signals (Plan §38, §39).
    flagReason: { type: String, default: null },
    abuseScore: { type: Number, default: 0 },

    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "urls" },
);

// Plan §8/§9/§10: the unique index IS the source of truth for code/alias races.
UrlSchema.index({ shortCode: 1 }, { unique: true });
// Owner dashboard list + filters (Plan §8, §22).
UrlSchema.index({ userId: 1, createdAt: -1 });
UrlSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Expiry sweep (Plan §11, §63).
UrlSchema.index({ expiresAt: 1 }, { sparse: true });
// Duplicate-destination / abuse burst detection (Plan §39).
UrlSchema.index({ normalizedUrl: 1 });
// Text search fallback (Plan §21 V2). Guarded by FEATURE_SEARCH at query time.
UrlSchema.index(
  { title: "text", originalUrl: "text", customAlias: "text", shortCode: "text" },
  { name: "url_text", weights: { customAlias: 10, shortCode: 10, title: 5, originalUrl: 1 } },
);

export type UrlDoc = InferSchemaType<typeof UrlSchema> & { _id: string };
export const Url: Model<UrlDoc> =
  (models.Url as Model<UrlDoc>) || model<UrlDoc>("Url", UrlSchema);
