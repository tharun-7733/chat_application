import { buildApp } from "./src/app/app.js";
import { connectTestDb, disconnectTestDb } from "./tests/helpers/db.js";
async function run() {
  process.env["MONGODB_URI"] = "mongodb://localhost:27017/test-env";
  process.env["REDIS_URL"] = "redis://localhost:6379";
  process.env["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long-for-hs256-aaaa";
  process.env["INTERNAL_SECRET"] = "test-internal-secret";
  process.env["NODE_ENV"] = "test";
  process.env["PORT"] = "0";
  await connectTestDb();
  const app = await buildApp();
  
  // Test validation error
  const res1 = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { username: "te", email: "test@example.com", password: "Password1" },
  });
  console.log("Validation error response:", res1.statusCode, res1.body);
  
  // Test valid registration
  const res2 = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { username: "testuser", email: "test@example.com", password: "Password1" },
  });
  console.log("Valid registration response:", res2.statusCode, res2.body);

  await app.close();
  await disconnectTestDb();
}
run().catch(console.error);
