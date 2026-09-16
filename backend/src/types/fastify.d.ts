/**
 * Fastify TypeScript augmentations.
 *
 * Adds `request.user` to the FastifyRequest type so handlers get type-safe
 * access to the authenticated user without casting everywhere.
 *
 * The `requireAuth` preHandler guarantees request.user is set before the
 * handler runs — but TypeScript can't know that statically without this
 * declaration.
 */
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Set by `requireAuth` preHandler after JWT verification.
     * Undefined on public routes.
     */
    user?: {
      userId: string;
    };
  }
}
