import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { assertCron } from "@/server/http/cron";
import { aggregateRecent } from "@/server/workers/aggregation-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const runner = route(
  async ({ req }) => {
    assertCron(req);
    const result = await aggregateRecent({ sinceMinutes: 90 });
    return json({ ok: true, ...result });
  },
  { name: "internal.aggregate" },
);

export { runner as GET, runner as POST };
