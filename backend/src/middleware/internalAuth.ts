/**
 * NexChat — Internal Service Auth Middleware
 *
 * Replaces: SecurityConfig.java — the rule that permits /api/internal/**
 *           only with the X-Internal-Token header.
 *
 * The Go WebSocket service calls POST /api/internal/messages with this header
 * to persist messages to MongoDB after real-time delivery.
 *
 * Security: The INTERNAL_SECRET must be a long random string shared only
 * between this service and the Go service (via Docker secrets / env vars).
 * It prevents external callers from injecting messages.
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config/index.js";
import { UnauthorizedError } from "../utils/errors.js";

export async function internalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.headers["x-internal-token"];

  if (!token || token !== config.internalSecret) {
    throw new UnauthorizedError("Invalid or missing internal service token");
  }
}
