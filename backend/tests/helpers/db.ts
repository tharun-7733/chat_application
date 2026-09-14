/**
 * NexChat — Shared Test Database Helper
 *
 * Provides start/stop/clear helpers for the in-memory MongoDB instance.
 * Used by all model and repository tests.
 *
 * mongodb-memory-server downloads a real MongoDB binary on first run and
 * caches it. Subsequent runs are instant. The instance runs in-process —
 * no external MongoDB required for tests.
 *
 * Usage:
 *   import { connectTestDb, disconnectTestDb, clearTestDb } from "./helpers/db.js";
 *   beforeAll(connectTestDb);
 *   afterEach(clearTestDb);    // clean slate between tests
 *   afterAll(disconnectTestDb);
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongod: MongoMemoryServer | null = null;

/**
 * Start the in-memory MongoDB server and open a Mongoose connection.
 * Call in beforeAll().
 */
export async function connectTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

/**
 * Drop all collections between tests (not between test files).
 * Faster than restarting the server.
 */
export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((col) => col.deleteMany({}))
  );
}

/**
 * Close the Mongoose connection and stop the in-memory server.
 * Call in afterAll().
 */
export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}
