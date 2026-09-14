/**
 * NexChat — Server Entry Point
 *
 * Orchestrates startup in the correct order:
 *  1. Validate config (crashes fast on missing env vars)
 *  2. Connect to MongoDB
 *  3. Connect to Redis
 *  4. Build Fastify app
 *  5. Start listening
 *
 * Also handles graceful shutdown on SIGTERM/SIGINT to avoid dropped requests
 * and ensure DB connections are cleanly closed.
 */
import mongoose from "mongoose";
import Redis from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { buildApp } from "../app/app.js";
import { setRedisClient } from "../controllers/health.controller.js";

// ── MongoDB Connection ─────────────────────────────────────────────────────────
async function connectMongoDB(): Promise<void> {
  logger.info(`[mongodb] Connecting to ${config.mongodbUri}...`);

  mongoose.connection.on("connected", () => {
    logger.info("✅ [mongodb] Connected");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("⚠️  [mongodb] Disconnected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "❌ [mongodb] Connection error");
  });

  await mongoose.connect(config.mongodbUri, {
    // Mongoose 8 uses the MongoDB Node.js driver v6 — these are the recommended
    // connection pool settings for a production microservice.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    // Auto-create indexes defined in Mongoose schemas on startup.
    // In production, disable and run createIndexes() as a migration step.
    autoIndex: config.isDev,
  });
}

// ── Redis Connection ───────────────────────────────────────────────────────────
function connectRedis(): Redis {
  logger.info(`[redis] Connecting to ${config.redisUrl}...`);

  const client = new Redis(config.redisUrl, {
    // Retry strategy: exponential backoff up to 3s, max 10 attempts
    retryStrategy(times) {
      if (times > 10) {
        logger.error("[redis] Max reconnect attempts reached");
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 3000);
      logger.warn(`[redis] Reconnecting in ${delay}ms (attempt ${times})...`);
      return delay;
    },
    lazyConnect: false,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,
  });

  client.on("connect", () => logger.info("✅ [redis] Connected"));
  client.on("ready", () => logger.info("✅ [redis] Ready"));
  client.on("error", (err: Error) => logger.error({ err }, "❌ [redis] Error"));
  client.on("close", () => logger.warn("⚠️  [redis] Connection closed"));

  return client;
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
function setupGracefulShutdown(
  app: Awaited<ReturnType<typeof buildApp>>,
  redis: Redis
): void {
  const shutdown = async (signal: string) => {
    logger.info(`[server] ${signal} received — starting graceful shutdown...`);

    try {
      // Stop accepting new connections; wait for in-flight requests to finish
      await app.close();
      logger.info("[server] Fastify server closed");

      // Close MongoDB connection
      await mongoose.connection.close();
      logger.info("[mongodb] Connection closed");

      // Close Redis connection
      await redis.quit();
      logger.info("[redis] Connection closed");

      logger.info("[server] Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "[server] Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Catch unhandled promise rejections — log and exit cleanly
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "[server] Unhandled promise rejection — exiting");
    process.exit(1);
  });

  // Catch uncaught synchronous exceptions
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "[server] Uncaught exception — exiting");
    process.exit(1);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  logger.info("🚀 NexChat Node.js Service starting...");
  logger.info(`   Environment: ${config.nodeEnv}`);
  logger.info(`   Port:        ${config.port}`);

  // Step 1: Connect infrastructure
  await connectMongoDB();
  const redis = connectRedis();

  // Step 2: Give Redis a moment to connect before starting the server
  // (ioredis connects asynchronously — we wait for 'ready' implicitly via ping)
  await redis.ping();

  // Step 3: Inject Redis into the health controller
  setRedisClient(redis);

  // Step 4: Build the Fastify application
  const app = await buildApp();

  // Step 5: Register graceful shutdown handlers
  setupGracefulShutdown(app, redis);

  // Step 6: Start listening
  await app.listen({ port: config.port, host: "0.0.0.0" });

  logger.info(`✅ NexChat Node.js Service listening on port ${config.port}`);
  logger.info(`   Health: http://localhost:${config.port}/api/health`);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "[server] Fatal startup error");
  process.exit(1);
});
