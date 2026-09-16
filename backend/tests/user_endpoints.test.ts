import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app/app.js";
import { connectTestDb, disconnectTestDb } from "./helpers/db.js";
import { createUser } from "../src/repositories/user.repository.js";
import { signAccessToken } from "../src/services/jwt.service.js";

describe("User Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await connectTestDb();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDb();
  });

  afterEach(async () => {
    const mongoose = await import("mongoose");
    const collections = mongoose.default.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  async function seedUser(username: string, email: string) {
    const user = await createUser({
      username,
      email,
      passwordHash: "dummyhash",
    });
    return user;
  }

  describe("GET /api/users/me", () => {
    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns the full profile for the authenticated user", async () => {
      const user = await seedUser("testuser", "test@example.com");
      const token = signAccessToken(user._id);

      const res = await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(user._id);
      expect(json.data.username).toBe("testuser");
      expect(json.data.email).toBe("test@example.com");
      expect(json.data).toHaveProperty("createdAt");
    });
  });

  describe("GET /api/users/:id", () => {
    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users/123",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns public profile (no email) for another user", async () => {
      const current = await seedUser("current", "current@example.com");
      const target = await seedUser("target", "target@example.com");
      const token = signAccessToken(current._id);

      const res = await app.inject({
        method: "GET",
        url: `/api/users/${target._id}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.id).toBe(target._id);
      expect(json.data.username).toBe("target");
      expect(json.data.email).toBeUndefined();
    });

    it("returns 404 for unknown user", async () => {
      const current = await seedUser("current", "current@example.com");
      const token = signAccessToken(current._id);

      const res = await app.inject({
        method: "GET",
        url: "/api/users/00000000-0000-0000-0000-000000000000",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/users/search", () => {
    it("finds users matching query and excludes self", async () => {
      const current = await seedUser("alice", "alice@example.com");
      const target1 = await seedUser("bob", "bob@example.com");
      const target2 = await seedUser("bobby", "bobby@example.com");
      await seedUser("charlie", "charlie@example.com");
      
      const token = signAccessToken(current._id);

      const res = await app.inject({
        method: "GET",
        url: "/api/users/search?q=bob",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data).toHaveLength(2);
      
      const usernames = json.data.map((u: any) => u.username);
      expect(usernames).toContain("bob");
      expect(usernames).toContain("bobby");
    });
    it("returns all users when query is empty", async () => {
      const current = await seedUser("david", "david@example.com");
      await seedUser("eve", "eve@example.com");
      await seedUser("frank", "frank@example.com");
      
      const token = signAccessToken(current._id);

      const res = await app.inject({
        method: "GET",
        url: "/api/users/search?q=",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      const usernames = json.data.map((u: any) => u.username);
      expect(usernames).toContain("eve");
      expect(usernames).toContain("frank");
      expect(usernames).not.toContain("david");
    });
  });

  describe("PUT /api/users/me", () => {
    it("updates the user profile", async () => {
      const user = await seedUser("updateme", "updateme@example.com");
      const token = signAccessToken(user._id);

      const res = await app.inject({
        method: "PUT",
        url: "/api/users/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          avatarUrl: "https://example.com/avatar.jpg",
          statusMessage: "Busy",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.avatarUrl).toBe("https://example.com/avatar.jpg");
      expect(json.data.statusMessage).toBe("Busy");
    });

    it("returns validation error if fields are too long", async () => {
      const user = await seedUser("updateme2", "updateme2@example.com");
      const token = signAccessToken(user._id);

      const res = await app.inject({
        method: "PUT",
        url: "/api/users/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          statusMessage: "a".repeat(151),
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/users", () => {
    it("returns all users except the authenticated one", async () => {
      const current = await seedUser("current1", "current1@example.com");
      await seedUser("other1", "other1@example.com");
      await seedUser("other2", "other2@example.com");
      const token = signAccessToken(current._id);

      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data.length).toBeGreaterThanOrEqual(2);
      const usernames = json.data.map((u: any) => u.username);
      expect(usernames).toContain("other1");
      expect(usernames).toContain("other2");
      expect(usernames).not.toContain("current1");
    });
  });
});
