/**
 * NexChat — Health Controller
 *
 * Replaces: Java's GET /actuator/health
 *
 * Returns the real connection status of MongoDB and Redis — not just an
 * unconditional 200. This allows load balancers and orchestrators to detect
 * when the service is genuinely unhealthy (e.g., can't reach the DB).
 *
 * Response shape:
 * {
 *   "success": true,
 *   "message": "Service healthy",
 *   "data": {
 *     "status": "healthy",
 *     "mongodb": "connected",
 *     "redis": "connected",
 *     "uptime": 123.456,
 *     "version": "1.0.0"
 *   },
 *   "timestamp": "..."
 * }
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import mongoose from "mongoose";
import type { Redis } from "ioredis";
import { successResponse, errorResponse } from "../utils/apiResponse.js";

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  mongodb: "connected" | "disconnected";
  redis: "connected" | "disconnected";
  uptime: number;
  version: string;
}

// The Redis client is injected at route registration time (from server/index.ts)
let redisClient: Redis | null = null;

export function setRedisClient(client: Redis): void {
  redisClient = client;
}

export async function healthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Mongoose readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoState = mongoose.connection.readyState;
  const mongoStatus: HealthData["mongodb"] =
    mongoState === 1 ? "connected" : "disconnected";

  // Redis: ping to verify the connection is alive
  let redisStatus: HealthData["redis"] = "disconnected";
  if (redisClient) {
    try {
      const pong = await redisClient.ping();
      redisStatus = pong === "PONG" ? "connected" : "disconnected";
    } catch {
      redisStatus = "disconnected";
    }
  }

  const allHealthy = mongoStatus === "connected" && redisStatus === "connected";
  const anyHealthy = mongoStatus === "connected" || redisStatus === "connected";

  const data: HealthData = {
    status: allHealthy ? "healthy" : anyHealthy ? "degraded" : "unhealthy",
    mongodb: mongoStatus,
    redis: redisStatus,
    uptime: process.uptime(),
    version: process.env["npm_package_version"] ?? "1.0.0",
  };

  const statusCode = allHealthy ? 200 : 503;
  const message = allHealthy ? "Service healthy" : "Service degraded";

  reply
    .code(statusCode)
    .send(
      allHealthy ? successResponse(message, data) : errorResponse(message)
    );
}
