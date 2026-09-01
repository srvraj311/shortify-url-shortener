import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["USER", "ADMIN"], default: "USER", index: true },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED", "BANNED"], default: "ACTIVE" },
    displayName: { type: String, trim: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: "users" },
);

// Plan §8: unique(email) is the source of truth for registration races.
UserSchema.index({ email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string };
export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);
