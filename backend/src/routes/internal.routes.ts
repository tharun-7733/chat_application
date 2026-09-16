import type { FastifyInstance } from "fastify";
import { saveMessageHandler } from "../controllers/internal.controller.js";
import { internalAuth } from "../middleware/internalAuth.js";

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // All internal routes require X-Internal-Token authentication
  fastify.addHook("preHandler", internalAuth);

  /**
   * POST /api/internal/messages
   */
  fastify.post("/messages", saveMessageHandler);
}
