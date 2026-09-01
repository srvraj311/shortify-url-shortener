import { z } from "zod";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { parseJson, clientIpHash } from "@/server/http/request";
import { authenticate } from "@/server/http/auth";
import { enforce } from "@/lib/ratelimit";
import { reportUrl } from "@/server/services/abuse.service";

const Body = z.object({
  reason: z.enum(["SPAM", "MALWARE", "PHISHING", "ABUSE", "OTHER"]),
  detail: z.string().max(1000).optional().nullable(),
});

// POST /api/v1/urls/:id/report — abuse report (anonymous allowed, Plan §38)
export const POST = route(
  async ({ req, params }) => {
    const auth = await authenticate(req);
    const ipHash = clientIpHash(req);
    await enforce("mutation", auth?.userId ?? `ip:${ipHash}`);
    const body = await parseJson(req, Body);
    const { id } = await reportUrl({
      urlId: String(params.id),
      reason: body.reason,
      detail: body.detail ?? null,
      reporterId: auth?.userId ?? null,
      reporterIpHash: auth ? null : ipHash,
    });
    return json({ reportId: id, status: "received" }, { status: 202 });
  },
  { name: "urls.report" },
);
