import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { assertCron } from "@/server/http/cron";
import { runSweep } from "@/server/workers/sweeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const runner = route(
  async ({ req }) => {
    assertCron(req);
    const result = await runSweep();
    return json({ ok: true, ...result });
  },
  { name: "internal.sweep" },
);

export { runner as GET, runner as POST };
