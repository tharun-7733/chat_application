const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
    
    // Check 'test' db
    const testDb = client.db('test');
    const testUsers = await testDb.collection('users').find({}).toArray();
    console.log("Users in 'test' DB:", testUsers.map(u => u.email));

    // Check 'nexchat' db
    const nexchatDb = client.db('nexchat');
    const nexchatUsers = await nexchatDb.collection('users').find({}).toArray();
    console.log("Users in 'nexchat' DB:", nexchatUsers.map(u => u.email));

  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
