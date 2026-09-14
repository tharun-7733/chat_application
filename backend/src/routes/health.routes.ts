/**
 * NexChat — Health Routes
 *
 * Registers health check endpoints:
 *  GET /api/health   — primary health check with MongoDB + Redis status
 *  GET /health       — simple alias (Docker / Kubernetes liveness probe)
 *
 * These routes are PUBLIC — no JWT required, never rate limited.
 */
import type { FastifyInstance } from "fastify";
import { healthHandler } from "../controllers/health.controller.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Primary health endpoint — returns full status JSON
  app.get("/api/health", healthHandler);

  // Alias: simple liveness probe used by Docker healthcheck + Go service
  // (Docker compose uses wget/curl on /health for the healthcheck command)
  app.get("/health", healthHandler);
}
