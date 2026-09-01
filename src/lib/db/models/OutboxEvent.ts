import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Transactional outbox (Plan §28). Domain writes and the intent to publish an
 * event are committed in the SAME Mongo transaction; a worker later drains this
 * collection and fans events out to consumers. Guarantees at-least-once
 * publication even if the process dies right after the DB commit.
 */
const OutboxEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "PUBLISHED", "DEAD"],
      default: "PENDING",
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    availableAt: { type: Date, default: Date.now }, // backoff gate
    lockedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    publishedAt: { type: Date, default: null },
  },
  { collection: "outbox_events" },
);

// Worker claim query: PENDING & availableAt<=now, oldest first.
OutboxEventSchema.index({ status: 1, availableAt: 1 });
// Reap published rows after a day.
OutboxEventSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 86_400, sparse: true });

export type OutboxEventDoc = InferSchemaType<typeof OutboxEventSchema> & { _id: string };
export const OutboxEvent: Model<OutboxEventDoc> =
  (models.OutboxEvent as Model<OutboxEventDoc>) ||
  model<OutboxEventDoc>("OutboxEvent", OutboxEventSchema);
