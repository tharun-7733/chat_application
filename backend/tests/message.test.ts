/**
 * NexChat — Message Model & Repository Tests
 *
 * Tests Mongoose Message schema and message.repository.ts functions.
 *
 * Verifies:
 *  - Schema validation (required fields, max content length, enum)
 *  - UUID string _id generation
 *  - createMessage persists correctly
 *  - findConversation returns bidirectional messages in ascending order
 *  - Cursor-based pagination (before parameter)
 *  - countUnreadByReceiver accuracy
 *  - markDelivered / markConversationRead idempotency
 *  - findRecentContacts aggregation
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { Message, MessageType } from "../src/models/Message.js";
import * as MsgRepo from "../src/repositories/message.repository.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db.js";

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const userA = uuidv4();
const userB = uuidv4();
const userC = uuidv4();

const makeMsg = (overrides: Partial<{
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: Date;
}> = {}) => ({
  senderId: userA,
  receiverId: userB,
  content: "Hello!",
  ...overrides,
});

// ── Model-level tests ─────────────────────────────────────────────────────────
describe("Message Model", () => {
  it("creates a message with UUID string _id", async () => {
    const msg = await Message.create(makeMsg());
    expect(typeof msg._id).toBe("string");
    expect(msg._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("defaults messageType to TEXT", async () => {
    const msg = await Message.create(makeMsg());
    expect(msg.messageType).toBe(MessageType.TEXT);
  });

  it("defaults isRead to false", async () => {
    const msg = await Message.create(makeMsg());
    expect(msg.isRead).toBe(false);
  });

  it("populates sentAt automatically", async () => {
    const msg = await Message.create(makeMsg());
    expect(msg.sentAt).toBeInstanceOf(Date);
  });

  it("rejects content longer than 4000 characters", async () => {
    await expect(
      Message.create(makeMsg({ content: "x".repeat(4001) }))
    ).rejects.toThrow(/4000 characters/);
  });

  it("requires receiverId", async () => {
    await expect(
      Message.create({ senderId: userA, content: "hi" })
    ).rejects.toThrow(/Receiver ID is required/);
  });

  it("allows null senderId (ON DELETE SET NULL equivalent)", async () => {
    const msg = await Message.create({
      receiverId: userB,
      content: "anonymous message",
    });
    expect(msg.senderId).toBeUndefined();
  });

  it("accepts valid messageType enum values", async () => {
    for (const type of Object.values(MessageType)) {
      const msg = await Message.create(makeMsg({ senderId: userA }));
      msg.messageType = type;
      await msg.save();
      expect(msg.messageType).toBe(type);
    }
  });

  it("rejects invalid messageType values", async () => {
    const msg = new Message({
      ...makeMsg(),
      messageType: "INVALID",
    });
    await expect(msg.save()).rejects.toThrow();
  });
});

// ── Repository-level tests ────────────────────────────────────────────────────
describe("Message Repository — createMessage", () => {
  it("creates and returns a persisted message", async () => {
    const msg = await MsgRepo.createMessage({
      senderId: userA,
      receiverId: userB,
      content: "Hey there!",
    });
    expect(msg._id).toBeTruthy();
    expect(msg.senderId).toBe(userA);
    expect(msg.receiverId).toBe(userB);
    expect(msg.content).toBe("Hey there!");
    expect(msg.isRead).toBe(false);
  });
});

describe("Message Repository — findConversation", () => {
  it("returns messages in both directions between two users", async () => {
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "A→B first" });
    await MsgRepo.createMessage({ senderId: userB, receiverId: userA, content: "B→A reply" });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userC, content: "unrelated" });

    const { items } = await MsgRepo.findConversation(userA, userB, { limit: 10 });
    expect(items).toHaveLength(2);
    // unrelated message not included
    expect(items.every((m) => [userA, userB].includes(m.senderId ?? "") || [userA, userB].includes(m.receiverId))).toBe(true);
  });

  it("returns items in ascending sentAt order (oldest first)", async () => {
    const base = new Date("2024-01-01T10:00:00Z");
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "first", sentAt: new Date(base.getTime()) });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "second", sentAt: new Date(base.getTime() + 1000) });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "third", sentAt: new Date(base.getTime() + 2000) });

    const { items } = await MsgRepo.findConversation(userA, userB, { limit: 10 });
    expect(items[0]!.content).toBe("first");
    expect(items[2]!.content).toBe("third");
  });

  it("paginates with hasMore=true when more messages exist", async () => {
    for (let i = 0; i < 5; i++) {
      await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: `msg ${i}` });
    }
    const { items, hasMore } = await MsgRepo.findConversation(userA, userB, { limit: 3 });
    expect(items).toHaveLength(3);
    expect(hasMore).toBe(true);
  });

  it("hasMore=false when all messages fit within limit", async () => {
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "only one" });
    const { hasMore } = await MsgRepo.findConversation(userA, userB, { limit: 10 });
    expect(hasMore).toBe(false);
  });

  it("cursor pagination: before param excludes newer messages", async () => {
    const base = new Date("2024-01-01T10:00:00Z");
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "old", sentAt: new Date(base.getTime()) });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "new", sentAt: new Date(base.getTime() + 5000) });

    // Fetch only messages before the newer one
    const cursor = new Date(base.getTime() + 5000).toISOString();
    const { items } = await MsgRepo.findConversation(userA, userB, { limit: 10, before: cursor });
    expect(items).toHaveLength(1);
    expect(items[0]!.content).toBe("old");
  });
});

describe("Message Repository — countUnreadByReceiver", () => {
  it("counts only unread messages for receiver", async () => {
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "unread 1" });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "unread 2" });
    // Create a read message
    const readMsg = await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "already read" });
    await Message.findByIdAndUpdate(readMsg._id, { isRead: true });
    // Message to different user - should not count
    await MsgRepo.createMessage({ senderId: userA, receiverId: userC, content: "for C" });

    expect(await MsgRepo.countUnreadByReceiver(userB)).toBe(2);
    expect(await MsgRepo.countUnreadByReceiver(userC)).toBe(1);
  });
});

describe("Message Repository — markDelivered", () => {
  it("sets deliveredAt on an undelivered message", async () => {
    const msg = await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "test" });
    const count = await MsgRepo.markDelivered(msg._id);
    expect(count).toBe(1);
    const updated = await MsgRepo.findMessageById(msg._id);
    expect(updated?.deliveredAt).toBeInstanceOf(Date);
  });

  it("is idempotent (calling twice does not reset deliveredAt)", async () => {
    const msg = await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "test" });
    await MsgRepo.markDelivered(msg._id);
    const first = await MsgRepo.findMessageById(msg._id);
    // Second call should not update (filter: deliveredAt $exists false)
    const secondCount = await MsgRepo.markDelivered(msg._id);
    expect(secondCount).toBe(0);
    const second = await MsgRepo.findMessageById(msg._id);
    expect(second?.deliveredAt?.getTime()).toBe(first?.deliveredAt?.getTime());
  });
});

describe("Message Repository — markConversationRead", () => {
  it("marks all unread messages in a conversation as read", async () => {
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "m1" });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "m2" });

    const count = await MsgRepo.markConversationRead(userA, userB);
    expect(count).toBe(2);

    expect(await MsgRepo.countUnreadByReceiver(userB)).toBe(0);
  });

  it("does not affect messages sent in the opposite direction", async () => {
    await MsgRepo.createMessage({ senderId: userB, receiverId: userA, content: "from B" });
    await MsgRepo.markConversationRead(userA, userB); // marks A→B, not B→A
    expect(await MsgRepo.countUnreadByReceiver(userA)).toBe(1);
  });
});

describe("Message Repository — findRecentContacts", () => {
  it("returns userIds sorted by most recent message", async () => {
    const base = new Date("2024-01-01T10:00:00Z");
    // A messaged B earlier, C more recently
    await MsgRepo.createMessage({ senderId: userA, receiverId: userB, content: "to B", sentAt: new Date(base.getTime()) });
    await MsgRepo.createMessage({ senderId: userA, receiverId: userC, content: "to C", sentAt: new Date(base.getTime() + 10000) });

    const contacts = await MsgRepo.findRecentContacts(userA);
    expect(contacts[0]).toBe(userC); // most recent first
    expect(contacts[1]).toBe(userB);
  });
});
