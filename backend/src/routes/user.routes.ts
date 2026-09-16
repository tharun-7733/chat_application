import type { FastifyInstance } from "fastify";
import {
  getMeHandler,
  getUserByIdHandler,
  searchUsersHandler,
  updateMeHandler,
  getAllUsersHandler,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/jwtAuth.js";

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // All user routes require JWT authentication
  fastify.addHook("preHandler", requireAuth);

  /**
   * GET /api/users/me
   */
  fastify.get("/me", getMeHandler);

  /**
   * PUT /api/users/me
   */
  fastify.put("/me", updateMeHandler);

  /**
   * GET /api/users
   */
  fastify.get("/", getAllUsersHandler);

  /**
   * GET /api/users/search?q=
   */
  fastify.get("/search", searchUsersHandler);

  /**
   * GET /api/users/:id
   */
  fastify.get("/:id", getUserByIdHandler);
}
