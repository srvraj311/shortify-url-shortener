import { existsSync } from "node:fs";
import { config } from "dotenv";

// Load the same files Next.js would, in the same precedence order.
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) config({ path: f });
}
