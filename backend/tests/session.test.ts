/**
 * NexChat — Session Model & Repository Tests
 *
 * Tests Mongoose Session schema and session.repository.ts functions.
 *
 * Verifies:
 *  - SHA-256 hashing (raw token never stored)
 *  - createSession stores hash, not raw token
 *  - findActiveSessionByToken looks up by raw token (hashes internally)
 *  - revokeSession soft-deletes (isActive = false)
 *  - revokeAllSessionsByUser invalidates all sessions for a user
 *  - Expired sessions are not returned by findActiveSessionByToken
 *  - countActiveSessionsByUser accuracy
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { Session } from "../src/models/Session.js";
import * as SessionRepo from "../src/repositories/session.repository.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db.js";

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeExpiry = (offsetMs = 7 * 24 * 60 * 60 * 1000): Date =>
  new Date(Date.now() + offsetMs);

const userId1 = uuidv4();
const userId2 = uuidv4();

// ── hashRefreshToken ──────────────────────────────────────────────────────────
describe("hashRefreshToken", () => {
  it("produces a 64-character hex SHA-256 hash", () => {
    const hash = SessionRepo.hashRefreshToken("some.jwt.token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for the same input", () => {
    const token = "consistent.token";
    expect(SessionRepo.hashRefreshToken(token)).toBe(
      SessionRepo.hashRefreshToken(token)
    );
  });

  it("matches external SHA-256 implementation", () => {
    const token = "verify.me";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(SessionRepo.hashRefreshToken(token)).toBe(expected);
  });
});

// ── Session Model ─────────────────────────────────────────────────────────────
describe("Session Model", () => {
  it("creates with UUID string _id", async () => {
    const session = await Session.create({
      userId: userId1,
      tokenHash: "a".repeat(64),
      expiresAt: makeExpiry(),
    });
    expect(typeof session._id).toBe("string");
  });

  it("defaults isActive to true", async () => {
    const session = await Session.create({
      userId: userId1,
      tokenHash: "b".repeat(64),
      expiresAt: makeExpiry(),
    });
    expect(session.isActive).toBe(true);
  });

  it("requires userId", async () => {
    await expect(
      Session.create({ tokenHash: "c".repeat(64), expiresAt: makeExpiry() })
    ).rejects.toThrow(/User ID is required/);
  });

  it("requires expiresAt", async () => {
    await expect(
      Session.create({ userId: userId1, tokenHash: "d".repeat(64) })
    ).rejects.toThrow(/Expiry date is required/);
  });

  it("enforces unique tokenHash", async () => {
    const hash = "e".repeat(64);
    await Session.create({ userId: userId1, tokenHash: hash, expiresAt: makeExpiry() });
    await expect(
      Session.create({ userId: userId1, tokenHash: hash, expiresAt: makeExpiry() })
    ).rejects.toThrow(/duplicate key/i);
  });
});

// ── Session Repository ────────────────────────────────────────────────────────
describe("Session Repository — createSession", () => {
  it("stores the hash, not the raw token", async () => {
    const rawToken = "my.raw.refresh.jwt";
    const session = await SessionRepo.createSession({
      userId: userId1,
      rawToken,
      expiresAt: makeExpiry(),
    });
    expect(session.tokenHash).not.toBe(rawToken);
    expect(session.tokenHash).toBe(SessionRepo.hashRefreshToken(rawToken));
    expect(session.tokenHash).toHaveLength(64);
  });

  it("sets isActive to true by default", async () => {
    const session = await SessionRepo.createSession({
      userId: userId1,
      rawToken: "active.token",
      expiresAt: makeExpiry(),
    });
    expect(session.isActive).toBe(true);
  });
});

describe("Session Repository — findActiveSessionByToken", () => {
  it("finds a session by raw token", async () => {
    const rawToken = "valid.token.123";
    await SessionRepo.createSession({ userId: userId1, rawToken, expiresAt: makeExpiry() });

    const session = await SessionRepo.findActiveSessionByToken(rawToken);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId1);
  });

  it("returns null for unknown token", async () => {
    const session = await SessionRepo.findActiveSessionByToken("unknown.token");
    expect(session).toBeNull();
  });

  it("returns null for expired session", async () => {
    const rawToken = "expired.token";
    // Create already-expired session
    await SessionRepo.createSession({
      userId: userId1,
      rawToken,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    });
    const session = await SessionRepo.findActiveSessionByToken(rawToken);
    expect(session).toBeNull();
  });

  it("returns null for revoked (isActive=false) session", async () => {
    const rawToken = "revoked.token";
    await SessionRepo.createSession({ userId: userId1, rawToken, expiresAt: makeExpiry() });
    await SessionRepo.revokeSession(rawToken);

    const session = await SessionRepo.findActiveSessionByToken(rawToken);
    expect(session).toBeNull();
  });
});

describe("Session Repository — revokeSession", () => {
  it("returns true when session is successfully revoked", async () => {
    const rawToken = "to.be.revoked";
    await SessionRepo.createSession({ userId: userId1, rawToken, expiresAt: makeExpiry() });
    expect(await SessionRepo.revokeSession(rawToken)).toBe(true);
  });

  it("sets isActive to false (soft delete)", async () => {
    const rawToken = "soft.delete.token";
    await SessionRepo.createSession({ userId: userId1, rawToken, expiresAt: makeExpiry() });
    await SessionRepo.revokeSession(rawToken);

    const hash = SessionRepo.hashRefreshToken(rawToken);
    const raw = await Session.findOne({ tokenHash: hash }).lean();
    expect(raw?.isActive).toBe(false);
  });

  it("returns false for non-existent token", async () => {
    expect(await SessionRepo.revokeSession("nonexistent")).toBe(false);
  });
});

describe("Session Repository — revokeAllSessionsByUser", () => {
  it("revokes all active sessions for a user", async () => {
    await SessionRepo.createSession({ userId: userId1, rawToken: "tok1", expiresAt: makeExpiry() });
    await SessionRepo.createSession({ userId: userId1, rawToken: "tok2", expiresAt: makeExpiry() });
    await SessionRepo.createSession({ userId: userId1, rawToken: "tok3", expiresAt: makeExpiry() });
    // Other user — should not be affected
    await SessionRepo.createSession({ userId: userId2, rawToken: "other", expiresAt: makeExpiry() });

    const count = await SessionRepo.revokeAllSessionsByUser(userId1);
    expect(count).toBe(3);
    expect(await SessionRepo.countActiveSessionsByUser(userId1)).toBe(0);
    expect(await SessionRepo.countActiveSessionsByUser(userId2)).toBe(1);
  });
});

describe("Session Repository — countActiveSessionsByUser", () => {
  it("counts only active, non-expired sessions", async () => {
    await SessionRepo.createSession({ userId: userId1, rawToken: "active1", expiresAt: makeExpiry() });
    await SessionRepo.createSession({ userId: userId1, rawToken: "active2", expiresAt: makeExpiry() });
    // Expired
    await SessionRepo.createSession({
      userId: userId1,
      rawToken: "expired1",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await SessionRepo.countActiveSessionsByUser(userId1)).toBe(2);
  });
});
