/**
 * NexChat — Friend Model & Repository Tests
 *
 * Tests Mongoose Friend schema and friend.repository.ts functions.
 *
 * Verifies:
 *  - Schema: unique (requesterId, addresseeId) pair constraint
 *  - sendFriendRequest creates a PENDING friendship
 *  - Duplicate request detection (both directions)
 *  - acceptFriendRequest transitions PENDING → ACCEPTED
 *  - declineFriendRequest removes the record
 *  - blockUser transitions PENDING/ACCEPTED → BLOCKED
 *  - removeFriendship removes the record (either direction)
 *  - findIncomingRequests / findOutgoingRequests / findAcceptedFriends
 *  - areFriends returns true only for ACCEPTED
 *  - findFriendIds returns correct partner IDs
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { FriendshipStatus } from "../src/models/Friend.js";
import * as FriendRepo from "../src/repositories/friend.repository.js";
import { ConflictError, NotFoundError } from "../src/utils/errors.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db.js";

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Fixed IDs for readability in tests
const alice = uuidv4();
const bob   = uuidv4();
const carol = uuidv4();

// ── sendFriendRequest ─────────────────────────────────────────────────────────
describe("FriendRepository — sendFriendRequest", () => {
  it("creates a PENDING friendship record", async () => {
    const friendship = await FriendRepo.sendFriendRequest(alice, bob);
    expect(friendship.requesterId).toBe(alice);
    expect(friendship.addresseeId).toBe(bob);
    expect(friendship.status).toBe(FriendshipStatus.PENDING);
    expect(typeof friendship._id).toBe("string");
  });

  it("throws ConflictError if a PENDING request already exists (A→B)", async () => {
    await FriendRepo.sendFriendRequest(alice, bob);
    await expect(
      FriendRepo.sendFriendRequest(alice, bob)
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError if a PENDING request already exists in reverse (B→A)", async () => {
    await FriendRepo.sendFriendRequest(alice, bob);
    await expect(
      FriendRepo.sendFriendRequest(bob, alice) // reverse direction
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError if users are already friends", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req._id, bob);
    await expect(
      FriendRepo.sendFriendRequest(alice, bob)
    ).rejects.toThrow(ConflictError);
  });
});

// ── acceptFriendRequest ───────────────────────────────────────────────────────
describe("FriendRepository — acceptFriendRequest", () => {
  it("transitions PENDING → ACCEPTED", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    const accepted = await FriendRepo.acceptFriendRequest(req._id, bob);
    expect(accepted.status).toBe(FriendshipStatus.ACCEPTED);
  });

  it("throws NotFoundError if the requestId does not exist", async () => {
    await expect(
      FriendRepo.acceptFriendRequest(uuidv4(), bob)
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError if wrong addresseeId is given (security check)", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    // carol tries to accept a request sent to bob — should fail
    await expect(
      FriendRepo.acceptFriendRequest(req._id, carol)
    ).rejects.toThrow(NotFoundError);
  });
});

// ── declineFriendRequest ──────────────────────────────────────────────────────
describe("FriendRepository — declineFriendRequest", () => {
  it("removes the pending request", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    const result = await FriendRepo.declineFriendRequest(req._id, bob);
    expect(result).toBe(true);
    expect(await FriendRepo.findFriendship(alice, bob)).toBeNull();
  });

  it("returns false for non-existent request", async () => {
    expect(await FriendRepo.declineFriendRequest(uuidv4(), bob)).toBe(false);
  });

  it("does not allow the requester to decline (only addressee can)", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    // alice tries to "decline" — she's the requester, not the addressee
    const result = await FriendRepo.declineFriendRequest(req._id, alice);
    expect(result).toBe(false); // filter by addresseeId: alice fails
  });
});

// ── blockUser ─────────────────────────────────────────────────────────────────
describe("FriendRepository — blockUser", () => {
  it("creates a BLOCKED record when no prior relationship exists", async () => {
    const blocked = await FriendRepo.blockUser(alice, bob);
    expect(blocked.status).toBe(FriendshipStatus.BLOCKED);
    expect(blocked.requesterId).toBe(alice);
  });

  it("transitions ACCEPTED → BLOCKED", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req._id, bob);

    const blocked = await FriendRepo.blockUser(alice, bob);
    expect(blocked.status).toBe(FriendshipStatus.BLOCKED);
  });

  it("transitions PENDING → BLOCKED", async () => {
    await FriendRepo.sendFriendRequest(alice, bob);
    const blocked = await FriendRepo.blockUser(bob, alice);
    expect(blocked.status).toBe(FriendshipStatus.BLOCKED);
  });
});

// ── removeFriendship ──────────────────────────────────────────────────────────
describe("FriendRepository — removeFriendship", () => {
  it("removes an ACCEPTED friendship (either direction)", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req._id, bob);

    // Bob initiates the unfriend
    const result = await FriendRepo.removeFriendship(bob, alice);
    expect(result).toBe(true);
    expect(await FriendRepo.findFriendship(alice, bob)).toBeNull();
  });

  it("returns false when no relationship exists", async () => {
    expect(await FriendRepo.removeFriendship(alice, carol)).toBe(false);
  });
});

// ── areFriends ────────────────────────────────────────────────────────────────
describe("FriendRepository — areFriends", () => {
  it("returns false when no relationship exists", async () => {
    expect(await FriendRepo.areFriends(alice, bob)).toBe(false);
  });

  it("returns false for PENDING status", async () => {
    await FriendRepo.sendFriendRequest(alice, bob);
    expect(await FriendRepo.areFriends(alice, bob)).toBe(false);
  });

  it("returns true for ACCEPTED status", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req._id, bob);
    expect(await FriendRepo.areFriends(alice, bob)).toBe(true);
    expect(await FriendRepo.areFriends(bob, alice)).toBe(true); // symmetric
  });

  it("returns false after unfriending", async () => {
    const req = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req._id, bob);
    await FriendRepo.removeFriendship(alice, bob);
    expect(await FriendRepo.areFriends(alice, bob)).toBe(false);
  });
});

// ── Lists ─────────────────────────────────────────────────────────────────────
describe("FriendRepository — lists", () => {
  it("findIncomingRequests returns only PENDING requests addressed to user", async () => {
    // Use fresh IDs per test to avoid cross-test conflicts
    const [u1, u2, u3, u4] = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];
    await FriendRepo.sendFriendRequest(u2, u1); // u2 → u1 (incoming for u1)
    await FriendRepo.sendFriendRequest(u3, u1); // u3 → u1 (incoming for u1)
    await FriendRepo.sendFriendRequest(u1, u4); // u1 → u4 (outgoing, not incoming for u1)

    const incoming = await FriendRepo.findIncomingRequests(u1);
    expect(incoming).toHaveLength(2);
    expect(incoming.every((r) => r.addresseeId === u1)).toBe(true);
  });

  it("findOutgoingRequests returns only PENDING requests sent by user", async () => {
    const [u1, u2, u3, u4] = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];
    await FriendRepo.sendFriendRequest(u1, u2);
    await FriendRepo.sendFriendRequest(u1, u3);
    await FriendRepo.sendFriendRequest(u4, u1); // incoming for u1, not outgoing

    const outgoing = await FriendRepo.findOutgoingRequests(u1);
    expect(outgoing).toHaveLength(2);
    expect(outgoing.every((r) => r.requesterId === u1)).toBe(true);
  });

  it("findAcceptedFriends returns friends from both directions", async () => {
    // alice→bob accepted, carol→alice accepted
    const req1 = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req1._id, bob);

    const req2 = await FriendRepo.sendFriendRequest(carol, alice);
    await FriendRepo.acceptFriendRequest(req2._id, alice);

    const friends = await FriendRepo.findAcceptedFriends(alice);
    expect(friends).toHaveLength(2);
    expect(friends.every((f) => f.status === FriendshipStatus.ACCEPTED)).toBe(true);
  });

  it("findFriendIds returns the correct partner IDs", async () => {
    const req1 = await FriendRepo.sendFriendRequest(alice, bob);
    await FriendRepo.acceptFriendRequest(req1._id, bob);
    const req2 = await FriendRepo.sendFriendRequest(carol, alice);
    await FriendRepo.acceptFriendRequest(req2._id, alice);

    const ids = await FriendRepo.findFriendIds(alice);
    expect(ids).toContain(bob);
    expect(ids).toContain(carol);
    expect(ids).not.toContain(alice); // not self
  });
});
