import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app/app.js";
import { connectTestDb, disconnectTestDb } from "./helpers/db.js";
import { config } from "../src/config/index.js";
import { createUser } from "../src/repositories/user.repository.js";

describe("Internal Endpoints", () => {
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

  describe("POST /api/internal/messages", () => {
    it("returns 401 without X-Internal-Token header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/internal/messages",
        payload: {
          senderId: "00000000-0000-0000-0000-000000000000",
          receiverId: "00000000-0000-0000-0000-000000000001",
          content: "Hello",
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong internal token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/internal/messages",
        headers: {
          "x-internal-token": "wrong-token",
        },
        payload: {
          senderId: "00000000-0000-0000-0000-000000000000",
          receiverId: "00000000-0000-0000-0000-000000000001",
          content: "Hello",
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it("persists message and returns response envelope when valid", async () => {
      const sender = await createUser({ username: "sender", email: "s@test.com", passwordHash: "h" });
      const receiver = await createUser({ username: "receiver", email: "r@test.com", passwordHash: "h" });
      
      const res = await app.inject({
        method: "POST",
        url: "/api/internal/messages",
        headers: {
          "x-internal-token": config.internalSecret,
        },
        payload: {
          senderId: sender._id,
          receiverId: receiver._id,
          content: "Hello internal test",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.senderId).toBe(sender._id);
      expect(json.data.receiverId).toBe(receiver._id);
      expect(json.data.content).toBe("Hello internal test");
      expect(json.data).toHaveProperty("sentAt");
    });
  });
});
