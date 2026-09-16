import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app/app.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "./helpers/db.js";

// Ensure env is set before app builds
process.env["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long-for-hs256-aaaa";
process.env["NODE_ENV"] = "test";

beforeAll(connectTestDb);
afterAll(async () => {
  await clearTestDb();
  await disconnectTestDb();
});

describe("Friend API Endpoints", () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to register a user and return their token and ID
  async function registerUser(username: string, email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username, email, password: "Password1" },
    });
    const body = res.json();
    return { token: body.data.accessToken, id: body.data.user.id };
  }

  beforeAll(async () => {
    // Setup two users for testing
    const userA = await registerUser("alice", "alice@example.com");
    const userB = await registerUser("bob", "bob@example.com");
    tokenA = userA.token;
    userAId = userA.id;
    tokenB = userB.token;
    userBId = userB.id;
  });

  it("POST /api/friends/requests - sends a friend request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetUserId: userBId },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.requesterId).toBe(userAId);
    expect(body.data.addresseeId).toBe(userBId);
    expect(body.data.status).toBe("PENDING");
  });

  it("POST /api/friends/requests - prevents duplicate requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetUserId: userBId },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/exists/i);
  });

  it("POST /api/friends/requests - prevents self requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetUserId: userAId }, // self
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/yourself/i);
  });

  it("GET /api/friends/pending - lists incoming requests for the recipient", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/friends/pending",
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].userId).toBe(userAId);
    expect(body.data[0].username).toBe("alice");
  });

  it("PUT /api/friends/requests/:id/accept - accepts a request", async () => {
    // First, get the request ID from the pending list
    const pendingRes = await app.inject({
      method: "GET",
      url: "/api/friends/pending",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const requestId = pendingRes.json().data[0].requestId;

    const res = await app.inject({
      method: "PUT",
      url: `/api/friends/requests/${requestId}/accept`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ACCEPTED");
  });

  it("GET /api/friends - lists accepted friends", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/friends",
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].userId).toBe(userBId);
    expect(body.data[0].username).toBe("bob");
    expect(body.data[0].status).toBe("ACCEPTED");
  });

  it("DELETE /api/friends/:userId - removes a friend", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/friends/${userBId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify list is empty
    const listRes = await app.inject({
      method: "GET",
      url: "/api/friends",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.json().data.length).toBe(0);
  });

  it("DELETE /api/friends/requests/:id/reject - rejects a pending request", async () => {
    // Setup: User A sends a new request to User B
    const sendRes = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetUserId: userBId },
    });
    const requestId = sendRes.json().data._id;

    // User B rejects
    const rejectRes = await app.inject({
      method: "DELETE",
      url: `/api/friends/requests/${requestId}/reject`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(rejectRes.statusCode).toBe(200);

    // Verify pending list is empty
    const pendingRes = await app.inject({
      method: "GET",
      url: "/api/friends/pending",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(pendingRes.json().data.length).toBe(0);
  });
});
