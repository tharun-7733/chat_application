const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const testDb = client.db('test');
    const sessions = await testDb.collection('sessions').find({}).toArray();
    console.log("Sessions in 'test' DB:", sessions);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
