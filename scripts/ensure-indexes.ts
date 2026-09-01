/**
 * Create every model's indexes explicitly (Plan §8, §59). Run in CI / on deploy
 * rather than relying on Mongoose autoIndex (which we leave on in dev only).
 *
 *   npm run db:indexes
 */
import "dotenv/config";
import { connectMongo, mongoose } from "@/lib/db/mongoose";
import * as models from "@/lib/db/models";

async function main() {
  await connectMongo();
  for (const [name, model] of Object.entries(models)) {
    if (typeof (model as { createIndexes?: unknown }).createIndexes !== "function") continue;
    process.stdout.write(`  ${name}: `);
    await (model as unknown as { createIndexes: () => Promise<void> }).createIndexes();
    const idx = await (model as unknown as { collection: { indexes: () => Promise<{ name: string }[]> } }).collection.indexes();
    console.log(idx.map((i) => i.name).join(", "));
  }
  await mongoose.disconnect();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
