/**
 * NexChat — Centralized Configuration
 *
 * Reads all environment variables once at startup, validates that required
 * vars are present, and exports a single typed `config` object.
 *
 * This means:
 *  1. The app crashes fast (at startup) if config is missing — not silently
 *     at runtime when a feature is first used.
 *  2. Every other file imports from here instead of reading process.env directly,
 *     keeping env var names in one place.
 */
import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[config] Missing required environment variable: ${key}\n` +
        `         Copy .env.example to .env and set all values.`
    );
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `[config] Environment variable ${key} must be an integer, got: "${raw}"`
    );
  }
  return parsed;
}

export const config = {
  // ── Server ────────────────────────────────────────────────────────────────
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  port: optionalEnvInt("PORT", 3000),
  isDev: optionalEnv("NODE_ENV", "development") !== "production",

  // ── MongoDB ───────────────────────────────────────────────────────────────
  mongodbUri: requireEnv("MONGODB_URI"),

  // ── Redis ─────────────────────────────────────────────────────────────────
  redisUrl: requireEnv("REDIS_URL"),

  // ── JWT ───────────────────────────────────────────────────────────────────
  // ⚠️  MUST match the JWT_SECRET used by the Go WebSocket service.
  jwtSecret: requireEnv("JWT_SECRET"),
  // Access token TTL in seconds (default: 900 = 15 min)
  jwtAccessExpirySeconds: optionalEnvInt("JWT_ACCESS_EXPIRY_SECONDS", 900),
  // Refresh token TTL in seconds (default: 604800 = 7 days)
  jwtRefreshExpirySeconds: optionalEnvInt("JWT_REFRESH_EXPIRY_SECONDS", 604800),

  // ── Internal Service Auth ─────────────────────────────────────────────────
  // ⚠️  MUST match INTERNAL_SECRET in the Go WebSocket service.
  internalSecret: requireEnv("INTERNAL_SECRET"),

  // ── CORS ──────────────────────────────────────────────────────────────────
  frontendUrl: optionalEnv("FRONTEND_URL", "http://localhost:5173"),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimitMax: optionalEnvInt("RATE_LIMIT_MAX", 5),
  rateLimitWindowSeconds: optionalEnvInt("RATE_LIMIT_WINDOW_SECONDS", 60),

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: optionalEnv("LOG_LEVEL", "info"),

  // ── BCrypt ────────────────────────────────────────────────────────────────
  // MUST stay at 12 to match Java's BCryptPasswordEncoder(12).
  bcryptSaltRounds: optionalEnvInt("BCRYPT_SALT_ROUNDS", 12),

  // ── Derived values (computed from above) ─────────────────────────────────
  // jwt.service.ts uses milliseconds, so we derive from the second values.
  get jwtAccessExpiryMs(): number {
    return this.jwtAccessExpirySeconds * 1000;
  },
  get jwtRefreshExpiryMs(): number {
    return this.jwtRefreshExpirySeconds * 1000;
  },
} as const;


export type Config = typeof config;
