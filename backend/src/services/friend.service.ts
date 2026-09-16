import { UnderlyingByteSource } from "stream/web";
import {
  sendFriendRequest,
  acceptFriendRequest as acceptRepoRequest,
  declineFriendRequest as declineRepoRequest,
  removeFriendship,
  findIncomingRequests,
  findOutgoingRequests,
  findAcceptedFriends,
  findFriendshipById,
  type IFriend,
  FriendshipStatus,
} from "../repositories/friend.repository.js";
import { findUserByIdOrThrow, findUserById } from "../repositories/user.repository.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

export interface FriendProfileDTO {
  requestId: string;
  userId: string;
  username: string;
  avatarUrl?: string | undefined;
  statusMessage?: string | undefined;
  lastSeen?: Date | undefined;
  status: FriendshipStatus;
  createdAt: Date;
}

/**
 * Send a friend request from requesterId to targetUserId.
 */
export async function sendRequest(
  requesterId: string,
  targetUserId: string
): Promise<IFriend> {
  if (requesterId === targetUserId) {
    throw new ConflictError("Cannot send a friend request to yourself");
  }

  // Ensure target user exists
  await findUserByIdOrThrow(targetUserId);

  return sendFriendRequest(requesterId, targetUserId);
}

/**
 * Accept a friend request.
 */
export async function acceptRequest(
  requestId: string,
  addresseeId: string
): Promise<IFriend> {
  return acceptRepoRequest(requestId, addresseeId);
}

/**
 * Decline a friend request.
 */
export async function declineRequest(
  requestId: string,
  addresseeId: string
): Promise<void> {
  const result = await declineRepoRequest(requestId, addresseeId);
  if (!result) {
    throw new NotFoundError("Friend request not found");
  }
}

/**
 * Remove a friend (either direction).
 */
export async function removeFriend(
  userId: string,
  targetUserId: string
): Promise<void> {
  const result = await removeFriendship(userId, targetUserId);
  if (!result) {
    throw new NotFoundError("Friendship not found");
  }
}

/**
 * Helper to enrich a friendship record with the partner's public profile data.
 */
async function enrichFriendship(
  friendship: IFriend,
  currentUserId: string
): Promise<FriendProfileDTO | null> {
  const partnerId =
    friendship.requesterId === currentUserId
      ? friendship.addresseeId
      : friendship.requesterId;

  const partner = await findUserById(partnerId);
  if (!partner) return null; // Partner account was deleted

  return {
    requestId: friendship._id,
    userId: partner._id,
    username: partner.username,
    avatarUrl: partner.avatarUrl,
    statusMessage: partner.statusMessage,
    lastSeen: partner.lastSeen,
    status: friendship.status,
    createdAt: friendship.createdAt,
  };
}

/**
 * List all accepted friends for a user, enriched with user profiles.
 */
export async function listFriends(userId: string): Promise<FriendProfileDTO[]> {
  const friendships = await findAcceptedFriends(userId);
  
  const enriched = await Promise.all(
    friendships.map((f) => enrichFriendship(f, userId))
  );

  // Filter out any nulls if users were deleted
  return enriched.filter((e): e is FriendProfileDTO => e !== null);
}

/**
 * List all incoming pending requests, enriched with user profiles.
 */
export async function listPendingRequests(
  userId: string
): Promise<FriendProfileDTO[]> {
  const requests = await findIncomingRequests(userId);
  
  const enriched = await Promise.all(
    requests.map((r) => enrichFriendship(r, userId))
  );

  return enriched.filter((e): e is FriendProfileDTO => e !== null);
}
