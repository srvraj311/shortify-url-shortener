import { z } from "zod";

/**
 * Centralised, validated configuration.
 *
 * Env vars are read once and validated with zod. Required secrets are only
 * enforced when {@link getConfig} is first called at *runtime* — importing this
 * module (e.g. during `next build`) never throws, so a missing var fails the
 * request that needs it rather than the whole build.
 */

const boolFlag = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const ConfigSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB_NAME: z.string().min(1).default("url-shortener-v1"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((v) => v.replace(/\/$/, "")),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal("")),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  ANALYTICS_EVENT_TTL_DAYS: z.coerce.number().int().positive().default(90),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  FEATURE_RATE_LIMIT: boolFlag(true),
  FEATURE_REDIS_CACHE: boolFlag(true),
  FEATURE_ANALYTICS: boolFlag(true),
  FEATURE_ASYNC_ANALYTICS: boolFlag(true),
  FEATURE_SEARCH: boolFlag(true),
  FEATURE_SSRF_GUARD: boolFlag(true),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  redisConfigured: boolean;
  isProduction: boolean;
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = {
    ...parsed.data,
    redisConfigured: Boolean(
      parsed.data.UPSTASH_REDIS_REST_URL && parsed.data.UPSTASH_REDIS_REST_TOKEN,
    ),
    isProduction: process.env.NODE_ENV === "production",
  };
  return cached;
}

/** Feature-flag accessor with per-request override support (see failure-injection). */
export function isFeatureEnabled(
  flag:
    | "FEATURE_RATE_LIMIT"
    | "FEATURE_REDIS_CACHE"
    | "FEATURE_ANALYTICS"
    | "FEATURE_ASYNC_ANALYTICS"
    | "FEATURE_SEARCH"
    | "FEATURE_SSRF_GUARD",
): boolean {
  return getConfig()[flag];
}

/** For tests: reset the memoised config. */
export function __resetConfigForTests() {
  cached = null;
}
