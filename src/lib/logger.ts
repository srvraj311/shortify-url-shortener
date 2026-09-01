import { getContext } from "./request-context";

/**
 * Minimal structured (JSON) logger. One line per event, machine-parseable,
 * automatically enriched with the current requestId / userId (Plan §44).
 *
 * No dependency on pino/winston: those pull native or Node-only transports that
 * are awkward on the Edge runtime and inflate the serverless bundle.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return ORDER[lvl] ?? ORDER.info;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const ctx = getContext();
  const record = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    msg,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    route: ctx?.route,
    ...sanitize(fields),
  };
  const line = JSON.stringify(record, replacer);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Never let a secret reach the logs (Plan §40). */
const REDACT_KEYS = /pass(word)?|secret|token|authorization|cookie|apikey|api_key|keyhash/i;
function sanitize(fields?: Record<string, unknown>) {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

function replacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
