/**
 * NexChat — User Model & Repository Tests
 *
 * Tests the Mongoose User schema and user.repository.ts functions.
 *
 * Verifies:
 *  - Schema validation (required fields, length limits, regex pattern)
 *  - Unique constraints (email, username)
 *  - Timestamps (createdAt, updatedAt auto-populated)
 *  - CRUD via repository (create, findById, findByEmail, search, updateLastSeen)
 *  - Safety (passwordHash excluded from all public queries)
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { User } from "../src/models/User.js";
import * as UserRepo from "../src/repositories/user.repository.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────
const makeUser = (overrides: Partial<{
  username: string;
  email: string;
  passwordHash: string;
}> = {}) => ({
  username: `testuser_${uuidv4().slice(0, 8)}`,
  email: `test_${uuidv4().slice(0, 8)}@example.com`,
  passwordHash: "$2b$12$hashedhash123456789012345678901234567890123456789012",
  ...overrides,
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// ── Model-level tests ─────────────────────────────────────────────────────────
describe("User Model", () => {
  it("creates a user with a UUID string _id by default", async () => {
    const data = makeUser();
    const user = await User.create(data);
    expect(typeof user._id).toBe("string");
    // UUID v4 regex
    expect(user._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("populates createdAt and updatedAt timestamps automatically", async () => {
    const user = await User.create(makeUser());
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("requires username", async () => {
    await expect(
      User.create({ email: "a@b.com", passwordHash: "hash" })
    ).rejects.toThrow(/Username is required/);
  });

  it("requires email", async () => {
    await expect(
      User.create({ username: "validuser", passwordHash: "hash" })
    ).rejects.toThrow(/Email is required/);
  });

  it("rejects usernames shorter than 3 characters", async () => {
    await expect(
      User.create(makeUser({ username: "ab" }))
    ).rejects.toThrow(/at least 3 characters/);
  });

  it("rejects usernames longer than 50 characters", async () => {
    await expect(
      User.create(makeUser({ username: "a".repeat(51) }))
    ).rejects.toThrow(/not exceed 50 characters/);
  });

  it("rejects usernames with invalid characters (spaces)", async () => {
    await expect(
      User.create(makeUser({ username: "invalid username" }))
    ).rejects.toThrow(/only contain letters/);
  });

  it("allows valid username patterns: letters, numbers, underscores, hyphens", async () => {
    const user = await User.create(makeUser({ username: "valid_user-123" }));
    expect(user.username).toBe("valid_user-123");
  });

  it("enforces unique email constraint", async () => {
    const email = "dupe@example.com";
    await User.create(makeUser({ email }));
    await expect(
      User.create(makeUser({ email }))
    ).rejects.toThrow(/duplicate key/i);
  });

  it("enforces unique username constraint", async () => {
    const username = "dupeuser";
    await User.create(makeUser({ username }));
    await expect(
      User.create(makeUser({ username }))
    ).rejects.toThrow(/duplicate key/i);
  });

  it("stores email in lowercase", async () => {
    const user = await User.create(makeUser({ email: "UPPER@EXAMPLE.COM" }));
    expect(user.email).toBe("upper@example.com");
  });
});

// ── Repository-level tests ────────────────────────────────────────────────────
describe("User Repository", () => {
  it("createUser returns user without passwordHash", async () => {
    const data = makeUser();
    const user = await UserRepo.createUser(data);
    expect("passwordHash" in user).toBe(false);
    expect(user.username).toBe(data.username);
    expect(user.email).toBe(data.email.toLowerCase());
  });

  it("findUserById returns user without passwordHash", async () => {
    const created = await UserRepo.createUser(makeUser());
    const found = await UserRepo.findUserById(created._id);
    expect(found).not.toBeNull();
    expect("passwordHash" in (found ?? {})).toBe(false);
    expect(found?._id).toBe(created._id);
  });

  it("findUserById returns null for unknown ID", async () => {
    const result = await UserRepo.findUserById(uuidv4());
    expect(result).toBeNull();
  });

  it("findUserByEmailWithPassword includes passwordHash", async () => {
    const data = makeUser();
    await UserRepo.createUser(data);
    const found = await UserRepo.findUserByEmailWithPassword(data.email);
    expect(found).not.toBeNull();
    expect(found?.passwordHash).toBeDefined();
    expect(found?.passwordHash).toBe(data.passwordHash);
  });

  it("existsByEmail returns true for existing email", async () => {
    const data = makeUser();
    await UserRepo.createUser(data);
    expect(await UserRepo.existsByEmail(data.email)).toBe(true);
  });

  it("existsByEmail returns false for non-existent email", async () => {
    expect(await UserRepo.existsByEmail("nobody@example.com")).toBe(false);
  });

  it("existsByUsername returns true for taken username", async () => {
    const data = makeUser();
    await UserRepo.createUser(data);
    expect(await UserRepo.existsByUsername(data.username)).toBe(true);
  });

  it("updateLastSeen updates the lastSeen field", async () => {
    const created = await UserRepo.createUser(makeUser());
    const ts = new Date();
    const count = await UserRepo.updateLastSeen(created._id, ts);
    expect(count).toBe(1);
    const updated = await UserRepo.findUserById(created._id);
    expect(updated?.lastSeen).toEqual(ts);
  });

  it("updateLastSeen returns 0 for unknown user", async () => {
    const count = await UserRepo.updateLastSeen(uuidv4(), new Date());
    expect(count).toBe(0);
  });

  it("findAllUsersExcept excludes the given userId", async () => {
    const a = await UserRepo.createUser(makeUser());
    const b = await UserRepo.createUser(makeUser());
    const c = await UserRepo.createUser(makeUser());

    const result = await UserRepo.findAllUsersExcept(a._id);
    const ids = result.map((u) => u._id);
    expect(ids).not.toContain(a._id);
    expect(ids).toContain(b._id);
    expect(ids).toContain(c._id);
  });

  it("searchUsersByUsername finds partial case-insensitive matches", async () => {
    await UserRepo.createUser(makeUser({ username: "alice_wonderland" }));
    await UserRepo.createUser(makeUser({ username: "ALICE_smith" }));
    await UserRepo.createUser(makeUser({ username: "bob_jones" }));
    const [alice1] = await UserRepo.findAllUsersExcept("fake-id");

    const results = await UserRepo.searchUsersByUsername("alice", alice1!._id, 32);
    const usernames = results.map((u) => u.username.toLowerCase());
    expect(usernames.every((u) => u.includes("alice"))).toBe(true);
    expect(usernames).not.toContain("bob_jones");
  });

  it("updateProfile updates avatarUrl and statusMessage", async () => {
    const created = await UserRepo.createUser(makeUser());
    const updated = await UserRepo.updateProfile(created._id, {
      avatarUrl: "https://example.com/avatar.png",
      statusMessage: "Hello!",
    });
    expect(updated?.avatarUrl).toBe("https://example.com/avatar.png");
    expect(updated?.statusMessage).toBe("Hello!");
    expect("passwordHash" in (updated ?? {})).toBe(false);
  });
});
