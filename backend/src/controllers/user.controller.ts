import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { successResponse } from "../utils/apiResponse.js";
  import { getAuthenticatedUser,
  getPublicProfile,
  searchUsers,
  getAllUsers,
  updateUserProfile,
} from "../services/user.service.js";
import { ValidationError } from "../utils/errors.js";

// Validation schema for search query
const SearchQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
});

// Validation schema for profile update
const UpdateProfileSchema = z.object({
  avatarUrl: z.string().trim().max(500, "Avatar URL is too long").optional(),
  statusMessage: z.string().trim().max(150, "Status message is too long").optional(),
});

/**
 * GET /api/users/me
 * Returns the currently authenticated user's full profile.
 */
export async function getMeHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const userId = req.user!.userId;
  const user = await getAuthenticatedUser(userId);
  
  res.status(200).send(
    successResponse("Profile retrieved", {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      statusMessage: user.statusMessage,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    })
  );
}

/**
 * GET /api/users/:id
 * Returns the public profile of a user (no email).
 */
export async function getUserByIdHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  res: FastifyReply
): Promise<void> {
  const targetUserId = req.params.id;
  const profile = await getPublicProfile(targetUserId);

  res.status(200).send(successResponse("User found", profile));
}

/**
 * GET /api/users/search?q=...
 * Searches for users by username (case-insensitive partial match).
 */
export async function searchUsersHandler(
  req: FastifyRequest<{ Querystring: { q?: string } }>,
  res: FastifyReply
): Promise<void> {
  const parseResult = SearchQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const { q } = parseResult.data;
  // Make sure we don't return the current user in search results
  const excludeId = req.user!.userId;

  let users;
  if (!q) {
    users = await getAllUsers(excludeId);
  } else {
    users = await searchUsers(q, excludeId);
  }

  // Map to search result DTO
  const data = users.map((u) => ({
    id: u._id,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
    statusMessage: u.statusMessage,
    lastSeen: u.lastSeen,
  }));

  res.status(200).send(successResponse("Users found", data));
}

/**
 * PUT /api/users/me
 * Updates the currently authenticated user's profile.
 */
export async function updateMeHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const parseResult = UpdateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const userId = req.user!.userId;
  const updatedUser = await updateUserProfile(userId, parseResult.data);

  res.status(200).send(
    successResponse("Profile updated", {
      id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      avatarUrl: updatedUser.avatarUrl,
      statusMessage: updatedUser.statusMessage,
      lastSeen: updatedUser.lastSeen,
      createdAt: updatedUser.createdAt,
    })
  );
}

/**
 * GET /api/users
 * Returns all users except the currently authenticated user.
 */
export async function getAllUsersHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const excludeId = req.user!.userId;
  const users = await getAllUsers(excludeId);

  const data = users.map((u) => ({
    id: u._id,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
    statusMessage: u.statusMessage,
    lastSeen: u.lastSeen,
  }));

  res.status(200).send(successResponse("Users retrieved", data));
}
