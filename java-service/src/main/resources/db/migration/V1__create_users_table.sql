-- =============================================================================
-- V1: Create Users Table
--
-- Migration: V1__create_users_table.sql
-- Author: NexChat Team
-- Description: Core user accounts table. Every other table references this one
--              via foreign key. The schema is designed to support OAuth in
--              future (avatar_url can hold external URLs).
-- =============================================================================

-- Enable the pgcrypto extension for UUID generation.
-- gen_random_uuid() is PostgreSQL's built-in UUID generator (no extension needed
-- in PostgreSQL 13+, but we declare it for compatibility).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    -- UUID primary key: globally unique, not sequential.
    -- ARCHITECTURE DECISION: UUID vs BIGSERIAL?
    --   BIGSERIAL: smaller (8 bytes), faster index lookups, but sequential —
    --     an attacker can enumerate user IDs (user/1, user/2...).
    --   UUID: larger (16 bytes), but opaque — safe to expose in URLs/APIs.
    --   For a user-facing ID, UUID is the right choice.
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,

    -- We store a BCrypt hash, NOT the password.
    -- BCrypt hash is always 60 characters. VARCHAR(60) is an exact fit.
    -- NEVER store plaintext passwords. Ever. Under any circumstances.
    password_hash   VARCHAR(60)  NOT NULL,

    -- URL to profile picture. Nullable — user may not have set one yet.
    -- In production, this would point to an S3/GCS bucket URL.
    avatar_url      VARCHAR(500),

    -- User's current status message (e.g., "In a meeting", "Available")
    status_message  VARCHAR(150),

    -- Tracks when the user was last active. Updated by Go WebSocket service
    -- on disconnect events. Used to show "last seen 5 minutes ago".
    last_seen       TIMESTAMP WITH TIME ZONE,

    -- WITH TIME ZONE ensures timestamps are stored as UTC in PostgreSQL.
    -- ALWAYS use TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ) for any timestamp
    --   that represents an absolute point in time. Never use plain TIMESTAMP —
    --   it's ambiguous and causes silent timezone bugs in distributed systems.
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index on email for fast login lookups (email is how users log in).
-- The UNIQUE constraint already creates an index, but naming it explicitly
-- makes it clear in query plans and monitoring tools.
CREATE INDEX idx_users_email ON users (email);

-- Index on username for user search functionality.
-- The UNIQUE constraint already creates one, but explicit naming is good practice.
CREATE INDEX idx_users_username ON users (username);

-- Partial index on last_seen for "online users" queries.
-- This index only covers users who have been seen recently, making the
-- "who's online" query extremely fast without scanning all users.
CREATE INDEX idx_users_last_seen ON users (last_seen)
    WHERE last_seen IS NOT NULL;
