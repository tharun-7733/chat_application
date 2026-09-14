/**
 * NexChat — Rate Limiter Configuration
 *
 * Replaces: RateLimitConfig.java (Bucket4j in-memory token bucket)
 *
 * Uses @fastify/rate-limit backed by Redis for distributed rate limiting.
 * Unlike Java's ConcurrentHashMap (per-instance only), this works correctly
 * when multiple Node.js instances run behind a load balancer.
 *
 * Applied ONLY to auth endpoints (register, login) via route-level hooks.
 * Other routes are protected naturally by JWT (brute force has no vector).
 */
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config } from "../config/index.js";

export async function registerRateLimiter(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    // Global defaults — can be overridden per-route
    max: config.rateLimitMax,
    // timeWindow accepts milliseconds
    timeWindow: config.rateLimitWindowSeconds * 1000,

    // Key function: rate limit per IP address
    // Handles X-Forwarded-For for clients behind a proxy/load balancer
    keyGenerator(request) {
      const forwarded = request.headers["x-forwarded-for"];
      if (typeof forwarded === "string") {
        return forwarded.split(",")[0]?.trim() ?? request.ip;
      }
      return request.ip;
    },

    // Error response: matches our ApiResponse envelope shape
    errorResponseBuilder(_request, context) {
      return {
        success: false,
        message: `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        timestamp: new Date().toISOString(),
      };
    },

    // Expose standard rate limit headers to the client
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
  });
}
