/**
 * NexChat — Fastify Application Factory
 *
 * Creates and configures the Fastify instance with all plugins and routes.
 * Exported as a factory function so tests can create a fresh app instance
 * without starting a real server (using Fastify's inject() API).
 *
 * Registration order matters in Fastify:
 *  1. Core plugins (logger, CORS, content-type parsers)
 *  2. Infrastructure plugins (rate limiter)
 *  3. Error handler
 *  4. Routes
 */
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { config } from "../config/index.js";
import { registerRateLimiter } from "../middleware/rateLimiter.js";
import { registerErrorHandler } from "../middleware/errorHandler.js";
import { healthRoutes } from "../routes/health.routes.js";

import { authRoutes } from "../routes/auth.routes.js";
import { userRoutes } from "../routes/user.routes.js";
import { friendRoutes } from "../routes/friend.routes.js";
import { internalRoutes } from "../routes/internal.routes.js";


export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // ── Logging ─────────────────────────────────────────────────────────────
    // Fastify uses Pino natively. In dev, pretty-print; in prod, JSON.
    logger: config.isDev
      ? {
          level: config.logLevel,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {
          level: config.logLevel,
          formatters: {
            level(label: string) {
              return { level: label };
            },
          },
        },

    // ── Request IDs ──────────────────────────────────────────────────────────
    // Attaches a unique request ID to every log entry for that request.
    // Allows correlating all log lines for a single HTTP request.
    genReqId(req) {
      return (
        (req.headers["x-request-id"] as string | undefined) ??
        `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      );
    },
  });

  // ── 1. CORS ───────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.frontendUrl.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Internal-Token",
      "X-Request-Id",
    ],
    credentials: true,
  });

  // ── 2. Rate Limiter (global plugin, applied per-route via config) ─────────
  await registerRateLimiter(app);

  // ── 3. Error Handler + 404 ────────────────────────────────────────────────
  registerErrorHandler(app);

  // ── 4. Routes ─────────────────────────────────────────────────────────────
  await app.register(healthRoutes);

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(friendRoutes, { prefix: "/api/friends" });
  await app.register(internalRoutes, { prefix: "/api/internal" });
  // ── 5. Startup hook: log all registered routes ───────────────────────────
  app.addHook("onReady", async () => {
    app.log.info("✅ All routes registered:");
    app
      .printRoutes()
      .split("\n")
      .forEach((r) => {
        if (r.trim()) app.log.info(`   ${r}`);
      });
  });

  return app;
}
