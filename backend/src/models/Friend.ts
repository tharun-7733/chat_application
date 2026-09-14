/**
 * NexChat — Friend Model
 *
 * Replaces: V3__create_friends_table.sql
 *
 * Like sessions, this model was NEVER implemented in Java — only the SQL schema
 * existed. Modelled here from day one so the friendship system can be built in
 * a future phase without schema migration pain.
 *
 * Uniqueness constraint: (requesterId, addresseeId) pair is unique.
 * This is enforced at the database level via a compound unique index.
 *
 * Business rules:
 *  - A user cannot befriend themselves (enforced in service layer, not here)
 *  - PENDING: requester sent an invite, waiting for addressee
 *  - ACCEPTED: both users are friends
 *  - BLOCKED: addressee blocked the requester
 */
import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const FriendshipStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  BLOCKED: "BLOCKED",
} as const;
export type FriendshipStatus =
  (typeof FriendshipStatus)[keyof typeof FriendshipStatus];

// ── TypeScript Interface ───────────────────────────────────────────────────────
export interface IFriend {
  _id: string;
  /** UUID string — the user who sent the friend request */
  requesterId: string;
  /** UUID string — the user who received the friend request */
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type FriendDocument = IFriend & Document<string>;

// ── Schema ────────────────────────────────────────────────────────────────────
const friendSchema = new Schema<IFriend>(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    requesterId: {
      type: String,
      required: [true, "Requester ID is required"],
      ref: "User",
    },
    addresseeId: {
      type: String,
      required: [true, "Addressee ID is required"],
      ref: "User",
    },
    status: {
      type: String,
      enum: Object.values(FriendshipStatus),
      default: FriendshipStatus.PENDING,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Unique pair: (requester, addressee). Mirrors SQL UNIQUE(requester_id, addressee_id).
friendSchema.index({ requesterId: 1, addresseeId: 1 }, { unique: true });
// "incoming friend requests" query
friendSchema.index({ addresseeId: 1, status: 1 });
// "my sent friend requests" query
friendSchema.index({ requesterId: 1, status: 1 });

// ── Model Export ──────────────────────────────────────────────────────────────
export const Friend = mongoose.model<IFriend>("Friend", friendSchema);
