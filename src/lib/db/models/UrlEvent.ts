import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;
import { getConfig } from "@/lib/config";

/**
 * Raw analytics event / event stream (Plan §23, §24, §77).
 * Privacy: only an IP *hash* is stored, never the raw address (Plan §41).
 */
const UrlEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true }, // idempotency key for consumers
    eventType: { type: String, default: "URL_CLICKED" },
    version: { type: Number, default: 1 },

    urlId: { type: Schema.Types.ObjectId, ref: "Url", required: true },
    shortCode: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    timestamp: { type: Date, required: true, default: Date.now },
    requestId: { type: String },

    ipHash: { type: String },
    country: { type: String, default: null },
    city: { type: String, default: null },
    userAgent: { type: String, default: null },
    device: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    referrerDomain: { type: String, default: null },
    isBot: { type: Boolean, default: false },
  },
  { collection: "url_events" },
);

// Per-URL analytics queries (Plan §8).
UrlEventSchema.index({ urlId: 1, timestamp: -1 });
// Single index on `timestamp` serves BOTH global time-range scans (Plan §46)
// and raw-event retention TTL (Plan §41). Days come from config at load time.
UrlEventSchema.index(
  { timestamp: 1 },
  {
    name: "raw_event_ttl",
    expireAfterSeconds: safeTtlSeconds(),
  },
);

function safeTtlSeconds(): number {
  try {
    return getConfig().ANALYTICS_EVENT_TTL_DAYS * 86_400;
  } catch {
    return 90 * 86_400;
  }
}

export type UrlEventDoc = InferSchemaType<typeof UrlEventSchema> & { _id: string };
export const UrlEvent: Model<UrlEventDoc> =
  (models.UrlEvent as Model<UrlEventDoc>) || model<UrlEventDoc>("UrlEvent", UrlEventSchema);
