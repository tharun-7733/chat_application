import { buildApp } from "./src/app/app.js";
import { connectTestDb, disconnectTestDb } from "./tests/helpers/db.js";
async function run() {
  await connectTestDb();
  const app = await buildApp();
  await app.ready();
  
  // Register
  const res1 = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { username: "testuser", email: "test@example.com", password: "Password1" },
  });
  console.log("Register:", res1.statusCode);
  
  // Login
  const res2 = await app.inject({
    method: "POST", url: "/api/auth/login",
    payload: { email: "test@example.com", password: "Password1" },
  });
  console.log("Login:", res2.statusCode, res2.body);

  await app.close();
  await disconnectTestDb();
}
run().catch(console.error);
