/**
 * NexChat — Message Model
 *
 * Replaces: Message.java entity + MessageRepository.java + V4__create_messages_table.sql
 *
 * Represents a chat message persisted AFTER real-time delivery via the
 * Go WebSocket service. Go calls POST /api/internal/messages to save here.
 *
 * Three-stage lifecycle:  SENT → DELIVERED → READ
 *   sentAt:      set when the message is first persisted (Go call)
 *   deliveredAt: set when the recipient's WebSocket client confirms receipt
 *   readAt:      set when the recipient opens the conversation
 */
import mongoose, { Document, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const MessageType = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  FILE: "FILE",
  VOICE: "VOICE",
  SYSTEM: "SYSTEM",
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

// ── TypeScript Interface ───────────────────────────────────────────────────────
export interface IMessage {
  _id: string;
  /** UUID string — references User._id (ON DELETE SET NULL equivalent: set undefined) */
  senderId?: string;
  /** UUID string — references User._id */
  receiverId: string;
  content: string;
  messageType: MessageType;
  isRead: boolean;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

export type MessageDocument = IMessage & Document<string>;

// ── Schema ────────────────────────────────────────────────────────────────────
const messageSchema = new Schema<IMessage>(
  {
    _id: {
      type: String,
      default: uuidv4,
    },
    senderId: {
      type: String,
      ref: "User",
      // Intentionally optional: mirrors ON DELETE SET NULL from V4 migration
    },
    receiverId: {
      type: String,
      required: [true, "Receiver ID is required"],
      ref: "User",
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      maxlength: [4000, "Message cannot exceed 4000 characters"],
    },
    messageType: {
      type: String,
      enum: Object.values(MessageType),
      default: MessageType.TEXT,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
  },
  {
    // No timestamps: true — we manage sentAt/deliveredAt/readAt manually
    // to match the Java model's precise semantics.
    timestamps: false,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Conversation query: "give me messages between A and B, sorted newest-first"
// Mirrors idx_messages_conversation from V4 migration.
messageSchema.index({ senderId: 1, receiverId: 1, sentAt: -1 });
// Reverse: "inbox" query from the receiver's perspective
messageSchema.index({ receiverId: 1, senderId: 1, sentAt: -1 });
// Unread count query: "how many unread messages does user X have?"
// Sparse-like via partialFilterExpression (mirrors V4's partial index)
messageSchema.index(
  { receiverId: 1, sentAt: 1 },
  { partialFilterExpression: { isRead: false } }
);

// ── Model Export ──────────────────────────────────────────────────────────────
export const Message = mongoose.model<IMessage>("Message", messageSchema);
