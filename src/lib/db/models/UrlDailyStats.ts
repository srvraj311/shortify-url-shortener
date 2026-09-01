import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Pre-aggregated read model (Plan §25, §77). One doc per (urlId, date).
 * The dashboard reads this instead of scanning raw url_events.
 */
const UrlDailyStatsSchema = new Schema(
  {
    urlId: { type: Schema.Types.ObjectId, ref: "Url", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (UTC)
    clicks: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    botClicks: { type: Number, default: 0 },
    byDevice: { type: Map, of: Number, default: {} },
    byBrowser: { type: Map, of: Number, default: {} },
    byOs: { type: Map, of: Number, default: {} },
    byCountry: { type: Map, of: Number, default: {} },
    byReferrer: { type: Map, of: Number, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "url_daily_stats" },
);

UrlDailyStatsSchema.index({ urlId: 1, date: 1 }, { unique: true });
UrlDailyStatsSchema.index({ date: 1 });

export type UrlDailyStatsDoc = InferSchemaType<typeof UrlDailyStatsSchema> & { _id: string };
export const UrlDailyStats: Model<UrlDailyStatsDoc> =
  (models.UrlDailyStats as Model<UrlDailyStatsDoc>) ||
  model<UrlDailyStatsDoc>("UrlDailyStats", UrlDailyStatsSchema);
