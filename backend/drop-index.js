const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const testDb = client.db('test');
    const sessions = testDb.collection('sessions');
    const indexes = await sessions.indexes();
    console.log("Indexes before:", indexes);
    
    // Drop tokenHash_1 if it exists
    const hasTokenHash = indexes.find(i => i.name === 'tokenHash_1');
    if (hasTokenHash) {
      await sessions.dropIndex('tokenHash_1');
      console.log("Dropped tokenHash_1 index!");
    }
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
