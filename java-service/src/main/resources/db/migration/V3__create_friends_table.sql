-- =============================================================================
-- V3: Create Friends Table
--
-- Migration: V3__create_friends_table.sql
-- Description: Models the friendship/connection graph between users.
--
-- ⚠️ ARCHITECTURE DECISION: Friend Request State Machine
--   PENDING:  requester has sent a request, addressee hasn't responded
--   ACCEPTED: both parties are friends, can see each other's messages
--   BLOCKED:  addressee has blocked requester; requester can't contact them
--
-- Why a separate friendship table instead of a join table?
--   Because friendship has STATE (it's not just a link) and DIRECTION
--   (A requested B, not B requested A — matters for the UI).
-- =============================================================================

-- Create the enum type first. PostgreSQL enums are stored as ints internally
-- (efficient) but displayed as human-readable strings (debuggable).
CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

CREATE TABLE friends (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The user who initiated the friend request.
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The user who received the friend request.
    addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    status          friendship_status NOT NULL DEFAULT 'PENDING',

    -- Prevent duplicate friend requests between the same two users.
    -- (A→B and B→A would create two rows without this constraint.)
    CONSTRAINT uq_friendship UNIQUE (requester_id, addressee_id),

    -- Prevent self-friendships (user friending themselves).
    CONSTRAINT chk_not_self_friend CHECK (requester_id != addressee_id),

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Efficient lookup of all friend requests received by a user.
CREATE INDEX idx_friends_addressee_status ON friends (addressee_id, status);

-- Efficient lookup of all friend requests sent by a user.
CREATE INDEX idx_friends_requester_status ON friends (requester_id, status);

-- Composite index for checking if a friendship exists between two specific users.
-- Used by the "can this user message that user?" check.
CREATE INDEX idx_friends_pair ON friends (requester_id, addressee_id, status);
