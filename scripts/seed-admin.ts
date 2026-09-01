/**
 * Create or promote an admin user (Plan §4, §15).
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run seed:admin
 */
import "./_env";
import { connectMongo, mongoose } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models";
import { hashPassword } from "@/lib/crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (>=8 chars)");
  }
  await connectMongo();

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "ADMIN";
    existing.status = "ACTIVE";
    await existing.save();
    console.log(`Promoted existing user ${email} to ADMIN`);
  } else {
    await User.create({ email, passwordHash: await hashPassword(password), role: "ADMIN", status: "ACTIVE" });
    console.log(`Created ADMIN user ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
