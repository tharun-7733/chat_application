-- =============================================================================
-- V4: Create Messages Table
--
-- Migration: V4__create_messages_table.sql
-- Description: Core message persistence. Stores all chat messages with
--              delivery and read receipt tracking.
--
-- ⚠️ SCALABILITY NOTE: This table will grow the fastest in the system.
--   At 1000 DAU sending 50 msgs/day = 50,000 rows/day = 18.25M rows/year.
--   At this scale, you'd want:
--     - Table partitioning by month (PostgreSQL PARTITION BY RANGE)
--     - Archival strategy (move old messages to cold storage)
--     - Read replicas for chat history queries
--   We design the schema to be partition-ready from day one.
-- =============================================================================

-- Message type enum: TEXT now, but designed for extensibility.
-- IMAGE, FILE, VOICE etc. will be added as new enum values (not new tables).
CREATE TYPE message_type AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE', 'SYSTEM');

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    -- ON DELETE SET NULL: if sender account is deleted, the message remains
    -- but sender_id becomes NULL. Preserves message history for the receiver.
    -- Alternative: ON DELETE CASCADE (delete all messages with the user).
    -- We chose SET NULL because in a chat app, context matters — "deleted user
    -- sent this" is better than losing the entire conversation.

    receiver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ON DELETE CASCADE: if the receiver's account is deleted, their messages
    -- are also deleted (GDPR compliance — right to erasure).

    content         TEXT NOT NULL,
    -- TEXT in PostgreSQL has no length limit but is still stored efficiently.
    -- We'll enforce a 4000 char limit at the application layer (@Size).

    message_type    message_type NOT NULL DEFAULT 'TEXT',

    -- Three-stage delivery lifecycle: SENT → DELIVERED → READ
    -- is_read is a convenience denormalization of read_at IS NOT NULL.
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,

    -- sent_at: when the sender's client sent the message (client clock).
    -- delivered_at: when the receiver's WebSocket connection received it.
    -- read_at: when the receiver opened and read the message.
    sent_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMP WITH TIME ZONE,
    read_at         TIMESTAMP WITH TIME ZONE

    -- NOTE: No updated_at column intentionally. Messages are immutable.
    -- "Edit message" would be a new message_edits table in a real system.
);

-- ⚠️ PERFORMANCE CRITICAL INDEXES:
-- The most common query is: "Give me all messages between user A and user B,
-- sorted by time, page N". This requires a composite index on both user IDs
-- and the timestamp for the ORDER BY + WHERE clause to be index-only.

-- Primary conversation query index.
-- Covers: WHERE (sender_id = A AND receiver_id = B) ORDER BY sent_at DESC
CREATE INDEX idx_messages_conversation ON messages (sender_id, receiver_id, sent_at DESC);

-- Reverse direction index.
-- Covers: WHERE (sender_id = B AND receiver_id = A) ORDER BY sent_at DESC
CREATE INDEX idx_messages_conversation_reverse ON messages (receiver_id, sender_id, sent_at DESC);

-- Unread messages index: fast lookup of "how many unread messages do I have?"
-- Partial index (WHERE is_read = FALSE) is much smaller than a full index
-- because the vast majority of messages are already read.
CREATE INDEX idx_messages_unread ON messages (receiver_id, sent_at)
    WHERE is_read = FALSE;
