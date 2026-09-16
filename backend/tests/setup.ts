import { beforeAll, afterEach, afterAll } from "vitest";

// Ensure tests have required environment variables before ANY imports occur
// that might evaluate src/config/index.ts
process.env["MONGODB_URI"] = "mongodb://localhost:27017/test-env";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long-for-hs256-aaaa";
process.env["INTERNAL_SECRET"] = "test-internal-secret";
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "0";

// Disable rate limit for tests
process.env["RATE_LIMIT_MAX"] = "1000";

// Use fast bcrypt for tests
process.env["BCRYPT_SALT_ROUNDS"] = "4";
