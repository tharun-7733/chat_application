import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/jwtAuth.js";
import {
  getFriendsHandler,
  getPendingRequestsHandler,
  sendRequestHandler,
  acceptRequestHandler,
  rejectRequestHandler,
  removeFriendHandler,
} from "../controllers/friend.controller.js";

export async function friendRoutes(fastify: FastifyInstance): Promise<void> {
  // All friend routes require JWT authentication
  fastify.addHook("preHandler", requireAuth);

  /**
   * GET /api/friends
   */
  fastify.get("/", getFriendsHandler);

  /**
   * GET /api/friends/pending
   */
  fastify.get("/pending", getPendingRequestsHandler);

  /**
   * POST /api/friends/requests
   */
  fastify.post("/requests", sendRequestHandler);

  /**
   * PUT /api/friends/requests/:id/accept
   */
  fastify.put("/requests/:id/accept", acceptRequestHandler);

  /**
   * DELETE /api/friends/requests/:id/reject
   */
  fastify.delete("/requests/:id/reject", rejectRequestHandler);

  /**
   * DELETE /api/friends/:userId
   */
  fastify.delete("/:userId", removeFriendHandler);
}
