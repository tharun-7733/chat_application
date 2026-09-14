/**
 * NexChat — Session Repository
 *
 * No Java equivalent — this was a TODO in AuthService.java.
 * Implements the refresh-token revocation store from scratch.
 *
 * Security contract:
 *  - tokenHash is SHA-256(rawRefreshJWT). Raw tokens are NEVER stored.
 *  - On logout: mark session isActive = false.
 *  - On token refresh: verify hash exists AND isActive = true AND not expired.
 *  - MongoDB TTL index auto-deletes expired sessions (no cleanup cron needed).
 *
 * Hashing is done HERE in this module (crypto.createHash) to keep the concern
 * in the data-access layer — callers always pass raw tokens.
 */
import { createHash } from "node:crypto";
import { Session, type ISession } from "../models/Session.js";

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * Hash a raw refresh token using SHA-256.
 * Returns a 64-character hex string.
 * This is the value stored in the DB — raw token is never persisted.
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Persist a new session when a user logs in or refreshes their token.
 *
 * @param userId     The user's UUID string
 * @param rawToken   The raw refresh JWT (will be SHA-256 hashed before storage)
 * @param expiresAt  When this session should expire (matches JWT exp)
 * @param meta       Optional device/IP metadata for session management UI
 */
export async function createSession(data: {
  userId: string;
  rawToken: string;
  expiresAt: Date;
  deviceInfo?: string;
  ipAddress?: string;
}): Promise<ISession> {
  const tokenHash = hashRefreshToken(data.rawToken);
  const session = await Session.create({
    userId: data.userId,
    tokenHash,
    expiresAt: data.expiresAt,
    deviceInfo: data.deviceInfo,
    ipAddress: data.ipAddress,
    isActive: true,
  });
  return session.toObject<ISession>();
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Find an active, non-expired session by its raw token.
 * Returns null if: not found, deactivated (logged out), or expired.
 *
 * Called on every token-refresh request.
 */
export async function findActiveSessionByToken(
  rawToken: string
): Promise<ISession | null> {
  const tokenHash = hashRefreshToken(rawToken);
  return Session.findOne({
    tokenHash,
    isActive: true,
    expiresAt: { $gt: new Date() }, // not yet expired
  }).lean<ISession>();
}

/**
 * Find all active sessions for a user (for "manage sessions" UI).
 */
export async function findActiveSessionsByUser(
  userId: string
): Promise<ISession[]> {
  return Session.find({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean<ISession[]>();
}

// ── Revoke ─────────────────────────────────────────────────────────────────────

/**
 * Revoke a specific session (logout from a single device).
 * Uses soft-delete: sets isActive = false rather than deleting the document.
 * This preserves the audit trail (TTL index will clean up expired sessions later).
 *
 * @returns true if the session was found and revoked, false if not found.
 */
export async function revokeSession(rawToken: string): Promise<boolean> {
  const tokenHash = hashRefreshToken(rawToken);
  const result = await Session.updateOne(
    { tokenHash, isActive: true },
    { $set: { isActive: false } }
  );
  return result.modifiedCount > 0;
}

/**
 * Revoke ALL active sessions for a user (logout from all devices).
 * Called on: password change, account compromise, or explicit "logout all" action.
 *
 * @returns count of sessions revoked.
 */
export async function revokeAllSessionsByUser(userId: string): Promise<number> {
  const result = await Session.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false } }
  );
  return result.modifiedCount;
}

/**
 * Count active sessions for a user.
 * Useful for limiting concurrent sessions (e.g., max 5 devices).
 */
export async function countActiveSessionsByUser(userId: string): Promise<number> {
  return Session.countDocuments({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });
}
