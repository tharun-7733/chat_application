/**
 * NexChat — JWT Authentication Middleware
 *
 * Mirrors: com.nexchat.security.JwtAuthFilter
 *
 * Fastify preHandler hook that:
 *  1. Extracts the Bearer token from Authorization header
 *  2. Verifies the JWT signature and expiry
 *  3. Attaches { userId } to request.user
 *
 * Usage — register on individual routes or route groups:
 *   fastify.addHook('preHandler', requireAuth);
 *   // or per-route:
 *   { preHandler: [requireAuth] }
 *
 * On failure, sends the same ApiResponse envelope as all other errors:
 *   { success: false, message: "...", data: null }
 *
 * ⚠️ SECURITY: We do NOT look up the user in MongoDB on every request
 * (unlike the Java JwtAuthFilter which had a DB call via loadEmailByUserId).
 * The JWT is self-contained — sub = userId. The DB lookup happens only in
 * handlers that need the full user object. This reduces latency and DB load.
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, JwtTokenExpiredError, JwtTokenInvalidError } from "../services/jwt.service.js";
import { errorResponse } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Extract raw JWT from "Authorization: Bearer <token>" header.
 * Returns undefined if header is absent or malformed.
 */
function extractBearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  return authHeader.slice(BEARER_PREFIX.length);
}

/**
 * Fastify preHandler: require a valid JWT access token.
 * Attaches request.user = { userId } on success.
 * Sends 401 on failure.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const raw = extractBearerToken(request);

  if (!raw) {
    return reply.code(401).send(
      errorResponse("Authentication required. Please provide a valid token.")
    );
  }

  try {
    const payload = verifyAccessToken(raw);
    // Attach to request — available in all downstream handlers
    (request as FastifyRequest & { user: { userId: string } }).user = {
      userId: payload.sub,
    };
  } catch (err) {
    if (err instanceof JwtTokenExpiredError) {
      return reply.code(401).send(
        errorResponse("Access token has expired. Please refresh your token.")
      );
    }
    if (err instanceof JwtTokenInvalidError) {
      logger.warn({ url: request.url }, "Invalid JWT rejected");
      return reply.code(401).send(
        errorResponse("Invalid token. Authentication required.")
      );
    }
    // Unexpected error — let the global error handler catch it
    throw err;
  }
}

/**
 * Fastify preHandler: optionally authenticate (does not block unauthenticated requests).
 * Attaches request.user if a valid token is present, otherwise request.user is undefined.
 * Useful for endpoints that customize their response for authenticated users.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const raw = extractBearerToken(request);
  if (!raw) return;

  try {
    const payload = verifyAccessToken(raw);
    (request as FastifyRequest & { user: { userId: string } }).user = {
      userId: payload.sub,
    };
  } catch {
    // Silently ignore — handler will treat user as unauthenticated
  }
}
