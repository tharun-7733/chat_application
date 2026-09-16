/**
 * NexChat — Auth Routes
 *
 * Fastify plugin that registers all /api/auth/* routes.
 * All routes are public (no requireAuth preHandler).
 *
 * The plugin pattern:
 *  - Encapsulates route registration in a Fastify plugin
 *  - Registered in app.ts with a prefix of /api/auth
 *  - Inherits the global errorHandler and rate limiter from the app
 */
import type { FastifyInstance } from "fastify";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  authHealthHandler,
} from "../controllers/auth.controller.js";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/register
   * Body: { username, email, password }
   * Response: 201 + ApiResponse<AuthResponse>
   */
  fastify.post("/register", registerHandler);

  /**
   * POST /api/auth/login
   * Body: { email, password }
   * Response: 200 + ApiResponse<AuthResponse>
   */
  fastify.post("/login", loginHandler);

  /**
   * POST /api/auth/refresh
   * Body: { refreshToken }
   * Response: 200 + ApiResponse<{ accessToken, accessTokenExpiresAt }>
   */
  fastify.post("/refresh", refreshHandler);

  /**
   * POST /api/auth/logout
   * Body: { refreshToken }
   * Response: 200 (always — idempotent)
   */
  fastify.post("/logout", logoutHandler);

  /**
   * GET /api/auth/health
   * Response: 200
   */
  fastify.get("/health", authHealthHandler);
}
