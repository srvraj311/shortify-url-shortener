import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** User-submitted abuse report (Plan §38, §54). */
const AbuseReportSchema = new Schema(
  {
    urlId: { type: Schema.Types.ObjectId, ref: "Url", required: true, index: true },
    shortCode: { type: String, required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reporterIpHash: { type: String, default: null },
    reason: {
      type: String,
      enum: ["SPAM", "MALWARE", "PHISHING", "ABUSE", "OTHER"],
      required: true,
    },
    detail: { type: String, default: null, maxlength: 1000 },
    status: {
      type: String,
      enum: ["OPEN", "REVIEWING", "ACTIONED", "DISMISSED"],
      default: "OPEN",
    },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  { collection: "abuse_reports" },
);

AbuseReportSchema.index({ status: 1, createdAt: -1 });

export type AbuseReportDoc = InferSchemaType<typeof AbuseReportSchema> & { _id: string };
export const AbuseReport: Model<AbuseReportDoc> =
  (models.AbuseReport as Model<AbuseReportDoc>) ||
  model<AbuseReportDoc>("AbuseReport", AbuseReportSchema);
