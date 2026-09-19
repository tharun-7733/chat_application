/**
 * NexChat — User Repository
 *
 * Replaces: UserRepository.java (Spring Data JPA)
 *
 * Method parity with Java:
 *   findByEmail()        → findByEmail()
 *   existsByEmail()      → existsByEmail()
 *   existsByUsername()   → existsByUsername()
 *   updatePasswordHash() → updatePassword()
 *   updateLastSeen()     → updateLastSeen()
 *   findAllExcept()      → findAllExcept()
 *   searchByUsername()   → searchByUsername()
 *
 * IMPORTANT: passwordHash is NEVER returned by public methods.
 * The only exception is findByEmailWithPassword(), used exclusively
 * by AuthService for login credential verification.
 */
import type { FilterQuery, UpdateQuery } from "mongoose";
import { User, type IUser } from "../models/User.js";
import { NotFoundError } from "../utils/errors.js";

// ── Public (safe) User type — no password hash ────────────────────────────────
export type SafeUser = Omit<IUser, "passwordHash">;

// Fields to exclude when returning users publicly
const EXCLUDE_PASSWORD = { passwordHash: 0 } as const;

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Find a user by their UUID. Returns null if not found.
 * Excludes passwordHash.
 */
export async function findUserById(id: string): Promise<SafeUser | null> {
  return User.findById(id, EXCLUDE_PASSWORD).lean<SafeUser>();
}

/**
 * Find a user by email — WITHOUT password exclusion.
 * Use ONLY in AuthService for credential verification.
 * Never send this result to the client.
 */
export async function findUserByEmailWithPassword(
  email: string
): Promise<IUser | null> {
  return User.findOne({ email: email.toLowerCase() }).lean<IUser>();
}

/**
 * Find a user by email — safe, no password hash.
 */
export async function findUserByEmail(
  email: string
): Promise<SafeUser | null> {
  return User.findOne({ email: email.toLowerCase() }, EXCLUDE_PASSWORD).lean<SafeUser>();
}

/**
 * Find a user by username — safe, no password hash.
 */
export async function findUserByUsername(
  username: string
): Promise<SafeUser | null> {
  return User.findOne({ username }, EXCLUDE_PASSWORD).lean<SafeUser>();
}

/**
 * Check if an email is already taken (registration check).
 * More efficient than findByEmail — stops at first match, no doc hydration.
 */
export async function existsByEmail(email: string): Promise<boolean> {
  return User.exists({ email: email.toLowerCase() }).then(Boolean);
}

/**
 * Check if a username is already taken (registration check).
 */
export async function existsByUsername(username: string): Promise<boolean> {
  return User.exists({ username }).then(Boolean);
}

/**
 * Create a new user. The passwordHash must already be a BCrypt hash —
 * plain-text passwords MUST NOT be passed here.
 *
 * @returns The created user without passwordHash.
 */
export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
}): Promise<SafeUser> {
  const user = await User.create({
    username: data.username,
    email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    avatarUrl: data.avatarUrl,
  });

  // Convert to plain object and strip passwordHash
  const { passwordHash: _omit, ...safe } = user.toObject<IUser>();
  return safe as SafeUser;
}

/**
 * Update a user's password hash (password change flow).
 * Returns the number of documents modified (0 = user not found, 1 = success).
 *
 * Replaces: userRepository.updatePasswordHash() @Modifying JPQL query
 */
export async function updatePassword(
  userId: string,
  newPasswordHash: string
): Promise<number> {
  const result = await User.updateOne(
    { _id: userId },
    { $set: { passwordHash: newPasswordHash } }
  );
  return result.modifiedCount;
}

/**
 * Update a user's lastSeen timestamp.
 * Called by the Go service via /api/internal when a WebSocket disconnects.
 *
 * Replaces: userRepository.updateLastSeen() @Modifying JPQL query
 */
export async function updateLastSeen(
  userId: string,
  lastSeen: Date
): Promise<number> {
  const result = await User.updateOne(
    { _id: userId },
    { $set: { lastSeen } }
  );
  return result.modifiedCount;
}

/**
 * Update a user's profile fields (avatar, status message).
 * Returns the updated user (without passwordHash) or null if not found.
 */
export async function updateProfile(
  userId: string,
  data: { avatarUrl?: string | undefined; statusMessage?: string | undefined }
): Promise<SafeUser | null> {
  const update: UpdateQuery<IUser> = { $set: {} };
  if (data.avatarUrl !== undefined)
    (update.$set as Record<string, unknown>)["avatarUrl"] = data.avatarUrl;
  if (data.statusMessage !== undefined)
    (update.$set as Record<string, unknown>)["statusMessage"] = data.statusMessage;

  return User.findByIdAndUpdate(userId, update, {
    new: true,
    projection: EXCLUDE_PASSWORD,
  }).lean<SafeUser>();
}

/**
 * Find a user by ID, throw NotFoundError if not found.
 */
export async function findUserByIdOrThrow(id: string): Promise<SafeUser> {
  const user = await findUserById(id);
  if (!user) throw new NotFoundError(`User not found: ${id}`);
  return user;
}

/**
 * Return all users except the given userId, sorted by username.
 * Used to populate the contacts/sidebar list.
 *
 * Replaces: userRepository.findAllExcept(excludeId) JPQL query
 */
export async function findAllUsersExcept(
  excludeUserId: string
): Promise<SafeUser[]> {
  return User.find(
    { _id: { $ne: excludeUserId } } as FilterQuery<IUser>,
    EXCLUDE_PASSWORD,
    { sort: { username: 1 } }
  ).lean<SafeUser[]>();
}

/**
 * Case-insensitive partial username search, excluding the current user.
 *
 * Replaces: userRepository.searchByUsername(query, excludeId) JPQL query
 * Uses MongoDB $regex with 'i' flag (case-insensitive).
 */
export async function searchUsersByUsername(
  query: string,
  excludeUserId: string,
  limit: number
): Promise<SafeUser[]> {
  return User.find(
    {
      username: { $regex: query, $options: "i" },
      _id: { $ne: excludeUserId },
    } as FilterQuery<IUser>,
    EXCLUDE_PASSWORD,
    { sort: { username: 1 }, limit }
  ).lean<SafeUser[]>();
}
