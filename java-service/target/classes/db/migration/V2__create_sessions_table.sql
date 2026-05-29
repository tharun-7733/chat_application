-- =============================================================================
-- V2: Create Sessions Table
--
-- Migration: V2__create_sessions_table.sql
-- Description: Stores refresh token metadata. This is how we achieve JWT
--              revocation — something pure JWTs can't do alone.
--
-- ⚠️ ARCHITECTURE DECISION: Why store sessions if we use JWT?
--   Access tokens (15 min) are stateless — we can't revoke them. That's fine.
--   Refresh tokens (7 days) must be revocable: logout, suspicious activity,
--   password change should invalidate all sessions. The sessions table gives us
--   that control. Only the HASH of the refresh token is stored (SHA-256).
--   Never store tokens in plaintext — treat them like passwords.
-- =============================================================================

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ON DELETE CASCADE: if the user account is deleted, all their sessions
    -- are automatically removed. No orphaned session records.

    -- We store the SHA-256 hash of the refresh token, not the token itself.
    -- When validating, we hash the incoming token and compare hashes.
    -- This means even if this DB is compromised, tokens can't be reused.
    token_hash      VARCHAR(64) NOT NULL UNIQUE,

    -- Metadata for session management UI ("Manage active sessions")
    -- Helps users identify and revoke sessions from specific devices.
    device_info     VARCHAR(500),
    ip_address      INET, -- PostgreSQL's native IP address type (validates format)

    -- is_active: soft-revoke mechanism. Set to false on logout.
    -- Faster than DELETE for audit purposes (you can see login history).
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fast lookup by token hash on every authenticated request that uses a refresh token.
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);

-- Fast lookup of all active sessions for a user (for logout-all-devices feature).
CREATE INDEX idx_sessions_user_id_active ON sessions (user_id, is_active)
    WHERE is_active = TRUE;

-- Expires at index for a cleanup job that purges expired sessions.
-- In Phase 6, we'll add a scheduled task that runs:
--   DELETE FROM sessions WHERE expires_at < NOW() OR is_active = FALSE
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
