/**
 * NexChat — Logger
 *
 * Pino is Fastify's native logger — it's already a dependency of Fastify.
 * This module exports a singleton logger for use outside of request handlers
 * (DB connection events, startup, Redis events, etc.).
 *
 * Inside request handlers, use `request.log` (Fastify attaches a child logger
 * with the request ID automatically).
 *
 * Log levels (ascending):
 *   trace < debug < info < warn < error < fatal
 */
import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.logLevel,
  // Pretty-print in dev; structured JSON in production.
  // pino-pretty is NOT installed — we use built-in transport options.
  ...(config.isDev
    ? {
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
        // Production: structured JSON — parse with jq, CloudWatch, etc.
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});
