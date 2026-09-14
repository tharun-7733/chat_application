/**
 * NexChat — User Model
 *
 * Replaces: User.java entity + UserRepository.java + V1__create_users_table.sql
 *
 * Key decisions:
 *  - _id is a string UUID (not ObjectId) to preserve the same ID format that
 *    the React frontend and Go service already depend on.
 *  - passwordHash is stored here; the plain-text password NEVER touches this model.
 *  - timestamps: true adds createdAt + updatedAt automatically (replaces @PrePersist/@PreUpdate).
 *  - Mongoose indexes replace CREATE INDEX from V1 migration.
 */
import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ── TypeScript Interface ───────────────────────────────────────────────────────
export interface IUser {
  _id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  statusMessage?: string;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Document type (used for queries that return the full Mongoose doc)
export type UserDocument = IUser & Document<string>;

// ── Schema ────────────────────────────────────────────────────────────────────
const userSchema = new Schema<IUser>(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [50, "Username must not exceed 50 characters"],
      // Matches Java's @Pattern: only alphanumeric + underscore/hyphen
      match: [
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, underscores, and hyphens",
      ],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [255, "Email must not exceed 255 characters"],
    },
    // BCrypt hash — always 60 characters when cost factor is 12
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
    },
    avatarUrl: {
      type: String,
      maxlength: [500, "Avatar URL must not exceed 500 characters"],
    },
    statusMessage: {
      type: String,
      maxlength: [150, "Status message must not exceed 150 characters"],
    },
    // Updated by the Go service when a user disconnects from WebSocket
    lastSeen: {
      type: Date,
    },
  },
  {
    // Adds createdAt + updatedAt (replaces @PrePersist / @PreUpdate from Java)
    timestamps: true,
    // Don't add __v (version key) — not needed for our use case
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// email and username are indexed by virtue of unique: true above.
// Additional index for presence/search queries:
userSchema.index({ lastSeen: 1 }, { sparse: true }); // sparse: only indexes docs with lastSeen set

// ── Model Export ──────────────────────────────────────────────────────────────
export const User = mongoose.model<IUser>("User", userSchema);
