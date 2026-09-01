import type { NextRequest } from "next/server";
import { newRequestId, runWithContext, getContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";
import { incr, observeLatency } from "@/lib/metrics";
import { applyChaosEffects } from "@/lib/failure-injection";
import { connectMongo } from "@/lib/db/mongoose";
import { errorResponse } from "./respond";
import { AppError } from "@/lib/errors";

export interface RouteCtx {
  req: NextRequest;
  params: Record<string, string | string[]>;
}

type RouteHandler = (ctx: RouteCtx) => Promise<Response>;

interface RouteOptions {
  /** connect to Mongo before the handler runs (default true). */
  db?: boolean;
  /** apply latency/error chaos injection for this route (default false; true for hot paths). */
  chaos?: boolean;
  /** short label for logs/metrics, e.g. "urls.create". */
  name: string;
}

/**
 * Wraps every API route: assigns a requestId, binds request context, times the
 * request, emits a structured access log, and converts thrown errors into the
 * canonical error contract (Plan §13, §44).
 */
export function route(handler: RouteHandler, opts: RouteOptions) {
  return async (
    req: NextRequest,
    segmentData: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    const incomingId = req.headers.get("x-request-id");
    const requestId =
      incomingId && /^[\w-]{8,64}$/.test(incomingId) ? incomingId : newRequestId();
    const params = (await segmentData?.params) ?? {};

    return runWithContext(
      { requestId, route: opts.name, method: req.method, startedAt: Date.now() },
      async () => {
        const start = performance.now();
        try {
          if (opts.db !== false) await connectMongo();
          if (opts.chaos) await applyChaosEffects(opts.name);

          const res = await handler({ req, params });
          finish(res.status, start, opts.name);
          res.headers.set("X-Request-Id", requestId);
          return res;
        } catch (err) {
          const res = errorResponse(err);
          const status = res.status;
          if (status >= 500) logger.error("request.failed", { status, err });
          else logger.warn("request.rejected", { status, code: (err as AppError)?.code });
          finish(status, start, opts.name);
          return res;
        }
      },
    );
  };
}

function finish(status: number, start: number, name: string) {
  const durationMs = Math.round(performance.now() - start);
  observeLatency(`http.${name}`, durationMs);
  incr("http.requests", 1, { route: name, status: statusClass(status) });
  const ctx = getContext();
  logger.info("request.completed", {
    status,
    durationMs,
    operation: name,
    userId: ctx?.userId,
  });
}

function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}
