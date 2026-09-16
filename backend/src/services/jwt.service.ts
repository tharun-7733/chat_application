/**
 * NexChat — JWT Service
 *
 * Mirrors: com.nexchat.security.JwtService
 *
 * Algorithm : HMAC-SHA256 (HS256) — symmetric, single shared secret.
 * Claims     : sub (userId string), type ("ACCESS"|"REFRESH"), iat, exp
 *
 * Token Lifecycle:
 *   1. Login/Register → signAccessToken() + signRefreshToken()
 *   2. Every request  → verifyAccessToken() → extracts userId
 *   3. Refresh        → verifyRefreshToken() → issue new access token
 *   4. Logout         → revoke refresh token hash in sessions collection
 *
 * Security notes:
 *  - JWT secret must be ≥ 256 bits (32 bytes) for HS256 — validated in config.
 *  - Access tokens: 15 min (short-lived — limit exposure window).
 *  - Refresh tokens: 7 days (long-lived — stored hash enables revocation).
 *  - Token type claim prevents an access token being used as a refresh or vice-versa.
 *  - Expired tokens throw a distinct error (JwtTokenExpiredError) so middleware
 *    can return 401 with a specific message that clients use to trigger refresh.
 */
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ── Token type discriminator (matches Java: "ACCESS" | "REFRESH") ─────────────
export const TOKEN_TYPE = {
  ACCESS: "ACCESS",
  REFRESH: "REFRESH",
} as const;
export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

// ── Payload structure (what we embed inside each JWT) ─────────────────────────
export interface JwtPayload {
  /** The authenticated user's UUID string — matches MongoDB _id */
  sub: string;
  /** Token type — prevents cross-purpose misuse */
  type: TokenType;
  /** Issued-at (Unix seconds) */
  iat: number;
  /** Expiration (Unix seconds) */
  exp: number;
}

// ── Custom error classes ───────────────────────────────────────────────────────

/** Token has a valid signature but is past its expiry time. */
export class JwtTokenExpiredError extends Error {
  constructor() {
    super("Token has expired");
    this.name = "JwtTokenExpiredError";
  }
}

/** Token is syntactically malformed, signature is invalid, or type is wrong. */
export class JwtTokenInvalidError extends Error {
  constructor(reason?: string) {
    super(reason ?? "Token is invalid");
    this.name = "JwtTokenInvalidError";
  }
}

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Sign a short-lived ACCESS token.
 * Default expiry: 15 minutes (configurable via JWT_ACCESS_EXPIRY_MS env).
 *
 * @param userId  The user's UUID string (stored as 'sub' claim)
 * @returns       Signed JWT string
 */
export function signAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: TOKEN_TYPE.ACCESS },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.floor(config.jwtAccessExpiryMs / 1000), // seconds
    }
  );
}

import crypto from "crypto";

/**
 * Sign a long-lived REFRESH token.
 * Default expiry: 7 days (configurable via JWT_REFRESH_EXPIRY_MS env).
 *
 * ⚠️ After signing, the CALLER MUST store a SHA-256 hash of this token
 * in the sessions collection to enable revocation (session.repository.ts).
 *
 * @param userId  The user's UUID string
 * @returns       Signed JWT string
 */
export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: TOKEN_TYPE.REFRESH, jti: crypto.randomUUID() },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: Math.floor(config.jwtRefreshExpiryMs / 1000),
    }
  );
}

/**
 * Return the Date when a newly-minted access token will expire.
 * Used to populate 'accessTokenExpiresAt' in the AuthResponse — matches
 * JwtService.getAccessTokenExpiresAt() in Java.
 */
export function getAccessTokenExpiresAt(): Date {
  return new Date(Date.now() + config.jwtAccessExpiryMs);
}

// ── Token verification ────────────────────────────────────────────────────────

/**
 * Verify and decode a token.
 * Throws JwtTokenExpiredError or JwtTokenInvalidError — never returns null.
 *
 * @internal — use verifyAccessToken / verifyRefreshToken for type safety.
 */
function verifyToken(raw: string, expectedType: TokenType): JwtPayload {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(raw, config.jwtSecret, {
      algorithms: ["HS256"],
    }) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new JwtTokenExpiredError();
    }
    // NotBeforeError, JsonWebTokenError, SyntaxError, etc.
    logger.warn({ err }, "JWT verification failed");
    throw new JwtTokenInvalidError(
      err instanceof Error ? err.message : "Malformed token"
    );
  }

  // Verify the type claim — prevent access tokens being used for refresh
  if (payload.type !== expectedType) {
    throw new JwtTokenInvalidError(
      `Expected ${expectedType} token, got ${payload.type}`
    );
  }

  return payload;
}

/**
 * Verify an ACCESS token and extract its payload.
 *
 * @throws JwtTokenExpiredError  — token is past expiry (client should refresh)
 * @throws JwtTokenInvalidError  — signature is bad, token is malformed, etc.
 */
export function verifyAccessToken(raw: string): JwtPayload {
  return verifyToken(raw, TOKEN_TYPE.ACCESS);
}

/**
 * Verify a REFRESH token and extract its payload.
 * The caller MUST also check the sessions collection — this only verifies
 * the cryptographic signature, not whether the session is active/revoked.
 *
 * @throws JwtTokenExpiredError
 * @throws JwtTokenInvalidError
 */
export function verifyRefreshToken(raw: string): JwtPayload {
  return verifyToken(raw, TOKEN_TYPE.REFRESH);
}

/**
 * Decode a token WITHOUT verifying the signature.
 * Use only when you need the claims after expiry (e.g., to extract userId
 * for logging). Never use for authentication decisions.
 */
export function decodeTokenUnsafe(raw: string): JwtPayload | null {
  try {
    return jwt.decode(raw) as JwtPayload | null;
  } catch {
    return null;
  }
}
