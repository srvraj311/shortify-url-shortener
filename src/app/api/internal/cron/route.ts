import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { assertCron } from "@/server/http/cron";
import { drainOutboxOnce } from "@/server/workers/outbox-worker";
import { aggregateRecent } from "@/server/workers/aggregation-worker";
import { runSweep } from "@/server/workers/sweeper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Combined daily cron (Plan §63). The Vercel Hobby plan only runs cron once per
 * day, so this single job does everything the schedulers would otherwise do
 * separately: fully drain the outbox, aggregate the read model, run maintenance.
 * Near-real-time work is handled opportunistically on hot requests instead.
 */
const runner = route(
  async ({ req }) => {
    assertCron(req);

    let drainTotal = { claimed: 0, published: 0, retried: 0, deadLettered: 0 };
    for (let i = 0; i < 20; i++) {
      const r = await drainOutboxOnce({ max: 200 });
      drainTotal = {
        claimed: drainTotal.claimed + r.claimed,
        published: drainTotal.published + r.published,
        retried: drainTotal.retried + r.retried,
        deadLettered: drainTotal.deadLettered + r.deadLettered,
      };
      if (r.claimed === 0) break;
    }

    const aggregate = await aggregateRecent({ sinceMinutes: 60 * 26 });
    const sweep = await runSweep();

    return json({ ok: true, drain: drainTotal, aggregate, sweep });
  },
  { name: "internal.cron" },
);

export { runner as GET, runner as POST };
