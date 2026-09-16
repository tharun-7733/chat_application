import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { successResponse } from "../utils/apiResponse.js";
import { ValidationError } from "../utils/errors.js";
import {
  sendRequest,
  acceptRequest,
  declineRequest,
  removeFriend,
  listFriends,
  listPendingRequests,
} from "../services/friend.service.js";

// Validation schemas
const SendRequestSchema = z.object({
  targetUserId: z.string().uuid("Invalid user ID format"),
});

const RequestIdParamSchema = z.object({
  id: z.string().uuid("Invalid request ID format"),
});

const UserIdParamSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
});

/**
 * GET /api/friends
 * List all accepted friends for the authenticated user.
 */
export async function getFriendsHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const userId = req.user!.userId;
  const friends = await listFriends(userId);
  res.status(200).send(successResponse("Friends retrieved successfully", friends));
}

/**
 * GET /api/friends/pending
 * List all incoming pending friend requests.
 */
export async function getPendingRequestsHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const userId = req.user!.userId;
  const requests = await listPendingRequests(userId);
  res.status(200).send(successResponse("Pending requests retrieved successfully", requests));
}

/**
 * POST /api/friends/requests
 * Send a friend request.
 */
export async function sendRequestHandler(
  req: FastifyRequest,
  res: FastifyReply
): Promise<void> {
  const parseResult = SendRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const requesterId = req.user!.userId;
  const { targetUserId } = parseResult.data;

  const friendship = await sendRequest(requesterId, targetUserId);
  res.status(201).send(successResponse("Friend request sent", friendship));
}

/**
 * PUT /api/friends/requests/:id/accept
 * Accept a pending friend request.
 */
export async function acceptRequestHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  res: FastifyReply
): Promise<void> {
  const parseResult = RequestIdParamSchema.safeParse(req.params);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const userId = req.user!.userId;
  const requestId = parseResult.data.id;

  const friendship = await acceptRequest(requestId, userId);
  res.status(200).send(successResponse("Friend request accepted", friendship));
}

/**
 * DELETE /api/friends/requests/:id/reject
 * Reject a pending friend request.
 */
export async function rejectRequestHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  res: FastifyReply
): Promise<void> {
  const parseResult = RequestIdParamSchema.safeParse(req.params);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const userId = req.user!.userId;
  const requestId = parseResult.data.id;

  await declineRequest(requestId, userId);
  res.status(200).send(successResponse("Friend request rejected", null));
}

/**
 * DELETE /api/friends/:userId
 * Remove an existing friend.
 */
export async function removeFriendHandler(
  req: FastifyRequest<{ Params: { userId: string } }>,
  res: FastifyReply
): Promise<void> {
  const parseResult = UserIdParamSchema.safeParse(req.params);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }

  const currentUserId = req.user!.userId;
  const targetUserId = parseResult.data.userId;

  await removeFriend(currentUserId, targetUserId);
  res.status(200).send(successResponse("Friend removed successfully", null));
}
