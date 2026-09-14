/**
 * NexChat — JWT Authentication Middleware
 *
 * Replaces: JwtAuthFilter.java (Spring Security OncePerRequestFilter)
 *           + UserDetailsServiceImpl.java
 *
 * Validates the Bearer token from the Authorization header, loads the user
 * from MongoDB, and attaches it to request.user.
 *
 * Routes that require authentication register this as a preHandler hook.
 * Public routes (auth endpoints) do NOT register this hook.
 *
 * JWT contract: MUST match the Java JwtService and Go middleware:
 *   - Algorithm:  HS256
 *   - sub:        UUID string (user._id)
 *   - type:       "ACCESS" (refresh tokens are rejected)
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { User, type IUser } from "../models/User.js";
import { UnauthorizedError } from "../utils/errors.js";

// ── TypeScript Augmentation ────────────────────────────────────────────────────
// Declare request.user on FastifyRequest so handlers can access it without casting.
declare module "fastify" {
  interface FastifyRequest {
    user?: IUser;
  }
}

// ── JWT Payload shape ─────────────────────────────────────────────────────────
interface JwtPayload {
  sub: string;   // User UUID
  type: string;  // "ACCESS" | "REFRESH"
  iat: number;
  exp: number;
}

// ── Middleware ────────────────────────────────────────────────────────────────
export async function jwtAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = authHeader.slice(7).trim();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
    }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token has expired");
    }
    throw new UnauthorizedError("Invalid access token");
  }

  // Reject refresh tokens — only ACCESS tokens are valid for API calls.
  // (Go service does the same check.)
  if (payload.type !== "ACCESS") {
    throw new UnauthorizedError(
      `Expected ACCESS token, received ${payload.type}`
    );
  }

  const userId = payload.sub;
  if (!userId) {
    throw new UnauthorizedError("Token missing subject claim");
  }

  // Load user from MongoDB — this replaces UserDetailsServiceImpl.loadUserByEmail()
  // In Java, the filter did an extra email lookup; here we use the UUID directly.
  const user = await User.findById(userId).lean();
  if (!user) {
    // User deleted after token was issued
    throw new UnauthorizedError("User associated with this token no longer exists");
  }

  // Attach to request — handlers access via request.user
  request.user = user;
}
