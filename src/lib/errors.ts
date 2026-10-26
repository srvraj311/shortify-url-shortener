import { getRequestId } from "./request-context";

/**
 * Canonical error contract (Plan §13).
 *
 *   { "error": { "code", "message", "requestId", "details"? } }
 *
 * Stack traces and internal exception detail never cross this boundary.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "URL_NOT_FOUND",
  "URL_EXPIRED",
  "URL_DISABLED",
  "ALIAS_TAKEN",
  "ALIAS_RESERVED",
  "RATE_LIMITED",
  "DUPLICATE_REQUEST",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_URL",
  "SSRF_BLOCKED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
  "DEPENDENCY_TIMEOUT",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  URL_NOT_FOUND: 404,
  URL_EXPIRED: 410,
  URL_DISABLED: 410,
  ALIAS_TAKEN: 409,
  ALIAS_RESERVED: 400,
  RATE_LIMITED: 429,
  DUPLICATE_REQUEST: 409,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_URL: 400,
  SSRF_BLOCKED: 400,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  DEPENDENCY_TIMEOUT: 504,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Extra headers to attach to the response (e.g. Retry-After for 429). */
  readonly headers?: Record<string, string>;
  /** true => safe to retry the exact same request. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { details?: unknown; headers?: Record<string, string>; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = opts.details;
    this.headers = opts.headers;
    this.retryable = opts.retryable ?? (this.status >= 500 || code === "RATE_LIMITED");
  }
}

export const notFound = (msg = "Resource not found") => new AppError("NOT_FOUND", msg);
export const unauthorized = (msg = "Authentication required") =>
  new AppError("UNAUTHORIZED", msg);
export const forbidden = (msg = "You do not have access to this resource") =>
  new AppError("FORBIDDEN", msg);
export const validation = (msg: string, details?: unknown) =>
  new AppError("VALIDATION_ERROR", msg, { details });
export const conflict = (code: ErrorCode, msg: string) => new AppError(code, msg);

export interface ErrorBody {
  error: { code: ErrorCode; message: string; requestId?: string; details?: unknown };
}

export function toErrorBody(err: unknown): { body: ErrorBody; status: number; headers?: Record<string, string> } {
  const requestId = getRequestId();
  if (err instanceof AppError) {
    return {
      status: err.status,
      headers: err.headers,
      body: {
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
    },
  };
}
