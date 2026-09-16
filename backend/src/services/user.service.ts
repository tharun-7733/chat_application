import {
  findUserById,
  searchUsersByUsername,
  updateProfile,
  findAllUsersExcept,
  type SafeUser,
} from "../repositories/user.repository.js";
import { UnauthorizedError, NotFoundError } from "../utils/errors.js";

/**
 * Return the safe user profile for a userId.
 * Used by GET /api/users/me after JWT middleware extracts the userId.
 *
 * @throws UnauthorizedError if user no longer exists
 */
export async function getAuthenticatedUser(userId: string): Promise<SafeUser> {
  const user = await findUserById(userId);
  if (!user) {
    // User was deleted after the JWT was issued
    throw new UnauthorizedError("Authentication required");
  }
  return user;
}

/**
 * Return the public profile for a target userId.
 * Excludes sensitive fields like email.
 *
 * @throws NotFoundError if target user doesn't exist
 */
export async function getPublicProfile(targetUserId: string) {
  const user = await findUserById(targetUserId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    id: user._id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    statusMessage: user.statusMessage,
    lastSeen: user.lastSeen,
    createdAt: user.createdAt,
  };
}

/**
 * Search users by username (partial match).
 * Excludes the searching user's ID from results.
 */
export async function searchUsers(
  query: string,
  excludeUserId: string,
  limit: number = 20
): Promise<SafeUser[]> {
  return searchUsersByUsername(query, excludeUserId, limit);
}

/**
 * Return all users except the excluded user.
 * Used to populate the contacts list.
 */
export async function getAllUsers(excludeUserId: string): Promise<SafeUser[]> {
  return findAllUsersExcept(excludeUserId);
}

/**
 * Update the authenticated user's profile.
 *
 * @throws NotFoundError if the user is missing
 */
export async function updateUserProfile(
  userId: string,
  data: { avatarUrl?: string | undefined; statusMessage?: string | undefined }
): Promise<SafeUser> {
  const updated = await updateProfile(userId, data);
  if (!updated) {
    throw new NotFoundError("User not found");
  }
  return updated;
}
