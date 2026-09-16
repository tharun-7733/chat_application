/**
 * NexChat — Message Repository
 *
 * Replaces: MessageRepository.java (Spring Data JPA)
 *
 * Method parity with Java:
 *   findConversation(userA, userB, pageable) → findConversation()
 *   countByReceiverIdAndIsReadFalse()        → countUnreadByReceiver()
 *
 * Extended with:
 *   createMessage()       — persist a new message (called from internal route)
 *   markDelivered()       — set deliveredAt timestamp
 *   markRead()            — set readAt, isRead = true (bulk for conversation)
 *   findRecentContacts()  — get recent conversation partners for sidebar
 */
import { Message, type IMessage, MessageType } from "../models/Message.js";
import { NotFoundError } from "../utils/errors.js";
import type { PaginationOptions, PageResult } from "./types.js";

// Re-export for convenience
export type { IMessage, MessageType };

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Persist a new message. Called by the internal route after Go delivers it.
 * sentAt defaults to now if not provided.
 */
export async function createMessage(data: {
  senderId?: string;
  receiverId: string;
  content: string;
  messageType?: MessageType;
  sentAt?: Date;
  isRead?: boolean;
}): Promise<IMessage> {
  const msg = await Message.create({
    senderId: data.senderId,
    receiverId: data.receiverId,
    content: data.content,
    messageType: data.messageType ?? MessageType.TEXT,
    sentAt: data.sentAt ?? new Date(),
    isRead: false,
  });
  return msg.toObject<IMessage>();
}

// ── Read ───────────────────────────────────────────────────────────────────────

/**
 * Fetch paginated conversation between two users, newest-first.
 *
 * Replaces: messageRepository.findConversation(userA, userB, pageable) JPQL
 * Uses cursor-based pagination (before sentAt) instead of offset — this is more
 * efficient for large message histories (no skip() cost).
 *
 * @param userA      First participant's userId
 * @param userB      Second participant's userId
 * @param options    limit + optional before-cursor (ISO date string)
 */
export async function findConversation(
  userA: string,
  userB: string,
  options: PaginationOptions
): Promise<PageResult<IMessage>> {
  const { limit, before } = options;

  // Build the base filter: messages between A→B or B→A
  const baseFilter = {
    $or: [
      { senderId: userA, receiverId: userB },
      { senderId: userB, receiverId: userA },
    ],
  };

  // Cursor: only fetch messages before a given timestamp
  const cursorFilter = before
    ? { sentAt: { $lt: new Date(before) } }
    : {};

  const filter = { ...baseFilter, ...cursorFilter };

  // Fetch one extra to determine hasMore
  const messages = await Message.find(filter)
    .sort({ sentAt: -1 })
    .limit(limit + 1)
    .lean<IMessage[]>();

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  // Return in ascending order (oldest first) for display
  return {
    items: messages.reverse(),
    hasMore,
  };
}

/**
 * Find a single message by ID.
 */
export async function findMessageById(id: string): Promise<IMessage | null> {
  return Message.findById(id).lean<IMessage>();
}

/**
 * Find a single message by ID, throw if not found.
 */
export async function findMessageByIdOrThrow(id: string): Promise<IMessage> {
  const msg = await findMessageById(id);
  if (!msg) throw new NotFoundError(`Message not found: ${id}`);
  return msg;
}

/**
 * Count unread messages for a receiver.
 *
 * Replaces: messageRepository.countByReceiverIdAndIsReadFalse(receiverId)
 */
export async function countUnreadByReceiver(receiverId: string): Promise<number> {
  return Message.countDocuments({ receiverId, isRead: false });
}

/**
 * Get the list of distinct users that the given user has exchanged messages with,
 * ordered by most recent interaction. Used to populate the sidebar contact list.
 *
 * Returns up to `limit` unique userIds (the "other" party in each conversation).
 */
export async function findRecentContacts(
  userId: string,
  limit = 50
): Promise<string[]> {
  // Aggregate: find messages where user is sender or receiver,
  // then group by conversation partner, sorted by most recent message.
  const results = await Message.aggregate<{ _id: string; lastAt: Date }>([
    {
      $match: {
        $or: [{ senderId: userId }, { receiverId: userId }],
      },
    },
    {
      $project: {
        // Compute the "other" user in this conversation
        otherUserId: {
          $cond: {
            if: { $eq: ["$senderId", userId] },
            then: "$receiverId",
            else: "$senderId",
          },
        },
        sentAt: 1,
      },
    },
    {
      $group: {
        _id: "$otherUserId",
        lastAt: { $max: "$sentAt" },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: limit },
  ]);

  return results.map((r) => r._id);
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Mark a single message as delivered (sets deliveredAt).
 * Returns modified count (0 = not found, 1 = updated).
 */
export async function markDelivered(
  messageId: string,
  deliveredAt: Date = new Date()
): Promise<number> {
  const result = await Message.updateOne(
    { _id: messageId, deliveredAt: { $exists: false } }, // idempotent
    { $set: { deliveredAt } }
  );
  return result.modifiedCount;
}

/**
 * Mark all messages in a conversation as read (bulk operation).
 * Called when a user opens a conversation.
 *
 * Only marks messages sent TO this user (receiverId = readerId).
 * Returns count of messages updated.
 */
export async function markConversationRead(
  senderId: string,
  receiverId: string,
  readAt: Date = new Date()
): Promise<number> {
  const result = await Message.updateMany(
    {
      senderId,
      receiverId,
      isRead: false,
    },
    {
      $set: { isRead: true, readAt },
    }
  );
  return result.modifiedCount;
}
