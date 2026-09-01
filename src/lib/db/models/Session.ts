import mongoose, { type InferSchemaType, type Model } from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Server-side session record (Plan §14). The cookie carries an opaque id; only
 * the SHA-256 hash of the secret is stored, so a DB leak can't mint sessions.
 */
const SessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionHash: { type: String, required: true, unique: true },
    userAgent: { type: String },
    ipHash: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: "sessions" },
);

// TTL: Mongo reaps expired sessions automatically (Plan §11, §63).
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof SessionSchema> & { _id: string };
export const Session: Model<SessionDoc> =
  (models.Session as Model<SessionDoc>) || model<SessionDoc>("Session", SessionSchema);
