import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { assertCron } from "@/server/http/cron";
import { drainOutboxOnce } from "@/server/workers/outbox-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Outbox drain worker (Plan §26). Invoked by Vercel Cron every minute and
 * callable manually with the cron secret. Serverless has no long-running
 * process, so the "worker" is a scheduled function that drains a bounded batch
 * each run (Plan §61).
 */
const runner = route(
  async ({ req }) => {
    assertCron(req);
    const result = await drainOutboxOnce({ max: 200 });
    return json({ ok: true, ...result });
  },
  { name: "internal.worker" },
);

export { runner as GET, runner as POST };
