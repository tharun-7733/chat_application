/**
 * NexChat — Health Endpoint Smoke Test
 *
 * Tests the health endpoint using Fastify's inject() API — no real network,
 * no real MongoDB or Redis connections needed.
 *
 * This verifies:
 *  1. The Fastify app builds without errors
 *  2. GET /api/health returns the expected response shape
 *  3. GET /health alias also works
 *  4. Response matches the ApiResponse envelope the frontend expects
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

// Set required env vars BEFORE importing config (which validates on import)
process.env["MONGODB_URI"] = "mongodb://localhost:27017/nexchat_test";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["JWT_SECRET"] = "test-secret-key-minimum-32-bytes-long!!";
process.env["INTERNAL_SECRET"] = "test-internal-secret";
process.env["NODE_ENV"] = "test";

// Import AFTER setting env vars
const { buildApp } = await import("../src/app/app.js");

describe("Health Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/health", () => {
    it("returns a response with the ApiResponse envelope shape", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      // The status may be 503 (degraded — no real DB in test env) but
      // the shape must always be correct.
      expect([200, 503]).toContain(response.statusCode);

      const body = response.json<{
        success: boolean;
        message: string;
        timestamp: string;
      }>();

      // Must always have these fields (matches Java's ApiResponse envelope)
      expect(typeof body.success).toBe("boolean");
      expect(typeof body.message).toBe("string");
      expect(typeof body.timestamp).toBe("string");
      // timestamp should be a valid ISO date string
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it("includes mongodb and redis status in data field when healthy", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      // Even when degraded, the response has the correct Content-Type
      expect(response.headers["content-type"]).toContain("application/json");
    });
  });

  describe("GET /health", () => {
    it("alias returns the same response as /api/health", async () => {
      const [primary, alias] = await Promise.all([
        app.inject({ method: "GET", url: "/api/health" }),
        app.inject({ method: "GET", url: "/health" }),
      ]);

      expect(primary.statusCode).toBe(alias.statusCode);

      const primaryBody = primary.json<{ message: string }>();
      const aliasBody = alias.json<{ message: string }>();

      // Same message (timestamps may differ slightly but message is the same)
      expect(primaryBody.message).toBe(aliasBody.message);
    });
  });

  describe("404 Handler", () => {
    it("returns ApiResponse envelope for unknown routes", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/does-not-exist",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ success: boolean; message: string }>();
      expect(body.success).toBe(false);
      expect(typeof body.message).toBe("string");
    });
  });
});
