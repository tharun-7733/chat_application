/**
 * NexChat — Friend Repository
 *
 * No Java equivalent — this was defined in SQL only (V3 migration), never coded.
 * Implements the full friendship state machine from scratch.
 *
 * State machine:
 *   [none] → PENDING   (sendRequest)
 *   PENDING → ACCEPTED  (accept)
 *   PENDING → BLOCKED   (block)
 *   ACCEPTED → BLOCKED  (block)
 *   any → [removed]     (remove / unfriend)
 *
 * Key invariant: (requesterId, addresseeId) is UNIQUE at the DB level.
 * The findFriendship() helper normalizes lookup by always checking both
 * directions (A→B and B→A) so callers don't need to know who requested.
 */
import { Friend, FriendshipStatus, type IFriend } from "../models/Friend.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

// Re-export for convenience
export type { IFriend, FriendshipStatus };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find an existing friendship record between two users in EITHER direction.
 * (A requested B) OR (B requested A) → same friendship.
 */
export async function findFriendship(
  userA: string,
  userB: string
): Promise<IFriend | null> {
  return Friend.findOne({
    $or: [
      { requesterId: userA, addresseeId: userB },
      { requesterId: userB, addresseeId: userA },
    ],
  }).lean<IFriend>();
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Send a friend request from requesterId to addresseeId.
 *
 * Throws ConflictError if:
 *   - A friendship/request already exists between these users
 *   - A user tries to request themselves (caller must validate)
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<IFriend> {
  // Check for existing relationship
  const existing = await findFriendship(requesterId, addresseeId);
  if (existing) {
    if (existing.status === FriendshipStatus.ACCEPTED) {
      throw new ConflictError("You are already friends with this user");
    }
    if (existing.status === FriendshipStatus.PENDING) {
      throw new ConflictError("A friend request already exists between you and this user");
    }
    if (existing.status === FriendshipStatus.BLOCKED) {
      throw new ConflictError("Cannot send friend request to this user");
    }
  }

  try {
    const friendship = await Friend.create({ requesterId, addresseeId });
    return friendship.toObject<IFriend>();
  } catch (err: unknown) {
    // Handle MongoDB duplicate key (unique index violation) gracefully
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError("A friend request already exists between you and this user");
    }
    throw err;
  }
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Get all PENDING requests received by a user (incoming requests).
 * Used for the "Friend requests" notification badge/list.
 */
export async function findIncomingRequests(userId: string): Promise<IFriend[]> {
  return Friend.find({
    addresseeId: userId,
    status: FriendshipStatus.PENDING,
  })
    .sort({ createdAt: -1 })
    .lean<IFriend[]>();
}

/**
 * Get all PENDING requests sent by a user (outgoing requests).
 */
export async function findOutgoingRequests(userId: string): Promise<IFriend[]> {
  return Friend.find({
    requesterId: userId,
    status: FriendshipStatus.PENDING,
  })
    .sort({ createdAt: -1 })
    .lean<IFriend[]>();
}

/**
 * Get all ACCEPTED friends for a user.
 * Returns in both directions (user may be requester or addressee).
 */
export async function findAcceptedFriends(userId: string): Promise<IFriend[]> {
  return Friend.find({
    $or: [{ requesterId: userId }, { addresseeId: userId }],
    status: FriendshipStatus.ACCEPTED,
  })
    .sort({ updatedAt: -1 })
    .lean<IFriend[]>();
}

/**
 * Get the IDs of all users that the given user is friends with (ACCEPTED).
 * Used to populate the chat sidebar contact list.
 */
export async function findFriendIds(userId: string): Promise<string[]> {
  const friendships = await findAcceptedFriends(userId);
  return friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId
  );
}

/**
 * Check whether two users are currently friends (ACCEPTED).
 */
export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const friendship = await findFriendship(userA, userB);
  return friendship?.status === FriendshipStatus.ACCEPTED;
}

/**
 * Get a friendship by its ID (for admin or detailed views).
 */
export async function findFriendshipById(id: string): Promise<IFriend | null> {
  return Friend.findById(id).lean<IFriend>();
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Accept an incoming friend request.
 * Only the addressee can accept (enforced by caller).
 *
 * @returns The updated friendship record.
 * @throws NotFoundError if the request doesn't exist or is not pending.
 */
export async function acceptFriendRequest(
  requestId: string,
  addresseeId: string
): Promise<IFriend> {
  const updated = await Friend.findOneAndUpdate(
    {
      _id: requestId,
      addresseeId,                     // must be the recipient
      status: FriendshipStatus.PENDING,
    },
    { $set: { status: FriendshipStatus.ACCEPTED } },
    { new: true }
  ).lean<IFriend>();

  if (!updated) {
    throw new NotFoundError("Friend request not found or already processed");
  }
  return updated;
}

/**
 * Decline/reject a pending friend request.
 * Removes the record entirely (user can re-request later).
 */
export async function declineFriendRequest(
  requestId: string,
  addresseeId: string
): Promise<boolean> {
  const result = await Friend.deleteOne({
    _id: requestId,
    addresseeId,
    status: FriendshipStatus.PENDING,
  });
  return result.deletedCount > 0;
}

/**
 * Block a user.
 * Can transition from PENDING or ACCEPTED → BLOCKED.
 * If no prior relationship exists, creates a BLOCKED record.
 */
export async function blockUser(
  blockerId: string,
  blockedId: string
): Promise<IFriend> {
  const existing = await findFriendship(blockerId, blockedId);

  if (existing) {
    const updated = await Friend.findByIdAndUpdate(
      existing._id,
      { $set: { status: FriendshipStatus.BLOCKED, requesterId: blockerId, addresseeId: blockedId } },
      { new: true }
    ).lean<IFriend>();
    if (!updated) throw new NotFoundError("Friendship not found during block");
    return updated;
  }

  // No prior relationship — create a BLOCKED record
  const blocked = await Friend.create({
    requesterId: blockerId,
    addresseeId: blockedId,
    status: FriendshipStatus.BLOCKED,
  });
  return blocked.toObject<IFriend>();
}

/**
 * Remove/unfriend a user (delete the friendship record entirely).
 * Either party can unfriend.
 *
 * @returns true if the friendship was removed, false if not found.
 */
export async function removeFriendship(
  userA: string,
  userB: string
): Promise<boolean> {
  const result = await Friend.deleteOne({
    $or: [
      { requesterId: userA, addresseeId: userB },
      { requesterId: userB, addresseeId: userA },
    ],
  });
  return result.deletedCount > 0;
}
