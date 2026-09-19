const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const testDb = client.db('test');
    
    // Simulate what Go backend does:
    const query = "Balu@gmail.com";
    const excludeID = "some-id";
    const filter = {
      _id: { $ne: excludeID },
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ]
    };
    
    const users = await testDb.collection('users').find(filter).toArray();
    console.log("Found users:", users);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
