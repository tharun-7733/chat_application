/**
 * NexChat — Session Model
 *
 * Replaces: V2__create_sessions_table.sql
 *
 * This model was NEVER implemented in the Java service (only the SQL table existed,
 * with a TODO comment in AuthService.java). Node.js implements it from day one.
 *
 * Purpose: Store hashed refresh tokens so they can be invalidated (logout/revoke).
 *
 * Security notes:
 *  - tokenHash is SHA-256 of the raw refresh JWT — the raw token is never stored.
 *    Even if the DB is breached, the tokens cannot be replayed without the JWT_SECRET.
 *  - MongoDB TTL index (expireAfterSeconds: 0) auto-deletes expired sessions,
 *    replacing the manual cleanup job that would have been needed in PostgreSQL.
 *  - isActive allows explicit revocation before TTL expiry (logout).
 */
import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ── TypeScript Interface ───────────────────────────────────────────────────────
export interface ISession {
  _id: string;
  /** UUID string — references User._id */
  userId: string;
  /** SHA-256 hash of the raw refresh JWT */
  tokenHash: string;
  deviceInfo?: string;
  ipAddress?: string;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionDocument = ISession & Document<string>;

// ── Schema ────────────────────────────────────────────────────────────────────
const sessionSchema = new Schema<ISession>(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    tokenHash: {
      type: String,
      required: [true, "Token hash is required"],
      unique: true,
      maxlength: [64, "Token hash must not exceed 64 characters"],
    },
    deviceInfo: {
      type: String,
      maxlength: [500, "Device info must not exceed 500 characters"],
    },
    ipAddress: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiry date is required"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// NOTE: tokenHash has unique: true in the field definition above, which
// automatically creates an index. No separate index needed.
// For "get all active sessions for a user" (profile/device management)
sessionSchema.index(
  { userId: 1, isActive: 1 },
  { partialFilterExpression: { isActive: true } }
);
// ⭐ MongoDB TTL index: automatically deletes expired sessions.
// When the current date > expiresAt, MongoDB removes the document.
// This replaces a manual cleanup cron job.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Model Export ──────────────────────────────────────────────────────────────
export const Session = mongoose.model<ISession>("Session", sessionSchema);
