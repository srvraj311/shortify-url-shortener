import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-request context propagated without threading it through every function.
 * Powers request correlation: the same requestId flows through logs, errors,
 * metrics and emitted events (Plan §44).
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  route?: string;
  method?: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  const full: RequestContext = {
    requestId: ctx.requestId || newRequestId(),
    userId: ctx.userId,
    route: ctx.route,
    method: ctx.method,
    startedAt: ctx.startedAt ?? Date.now(),
  };
  return storage.run(full, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setUserId(userId: string) {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}

export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
