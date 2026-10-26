import mongoose from "mongoose";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Serverless-safe Mongoose connection (Plan §60, §61).
 *
 * Each warm function instance keeps ONE pooled connection on the module global.
 * We never open a connection per request; concurrent cold requests share a
 * single in-flight connect promise.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };
const cache: MongooseCache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const { MONGODB_URI, MONGODB_DB_NAME } = getConfig();
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: MONGODB_DB_NAME,
        // Keep the pool small: many function instances * large pools exhausts Atlas.
        maxPoolSize: 5,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 20_000,
        connectTimeoutMS: 10_000,
        retryWrites: true,
      })
      .then((m) => {
        logger.info("mongo.connected", { db: MONGODB_DB_NAME });
        return m;
      })
      .catch((err) => {
        cache.promise = null; // allow a later retry
        logger.error("mongo.connect_failed", { err });
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export async function mongoPing(): Promise<boolean> {
  try {
    const m = await connectMongo();
    await m.connection.db!.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export { mongoose };
