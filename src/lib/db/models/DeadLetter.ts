import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/** Dead-letter queue (Plan §29). Events that exhausted their retry budget. */
const DeadLetterSchema = new Schema(
  {
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    consumer: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    error: { type: String, required: true },
    attempts: { type: Number, required: true },
    firstFailedAt: { type: Date, required: true },
    deadLetteredAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["OPEN", "RETRIED", "DISCARDED"], default: "OPEN" },
  },
  { collection: "dead_letters" },
);

DeadLetterSchema.index({ status: 1, deadLetteredAt: -1 });

export type DeadLetterDoc = InferSchemaType<typeof DeadLetterSchema> & { _id: string };
export const DeadLetter: Model<DeadLetterDoc> =
  (models.DeadLetter as Model<DeadLetterDoc>) ||
  model<DeadLetterDoc>("DeadLetter", DeadLetterSchema);
