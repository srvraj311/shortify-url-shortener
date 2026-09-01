import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Consumer-side dedupe log (Plan §27). Each (consumer, eventId) pair is recorded
 * once; a unique-index violation on insert => "already processed, skip".
 * This is what turns at-least-once delivery into effectively-once processing.
 */
const ProcessedEventSchema = new Schema(
  {
    consumer: { type: String, required: true },
    eventId: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { collection: "processed_events" },
);

ProcessedEventSchema.index({ consumer: 1, eventId: 1 }, { unique: true });
ProcessedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 7 * 86_400 });

export type ProcessedEventDoc = InferSchemaType<typeof ProcessedEventSchema> & { _id: string };
export const ProcessedEvent: Model<ProcessedEventDoc> =
  (models.ProcessedEvent as Model<ProcessedEventDoc>) ||
  model<ProcessedEventDoc>("ProcessedEvent", ProcessedEventSchema);
