import { createClient } from 'redis';

let client = null;

async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL
    });
    client.on('error', (err) => console.error('Redis Client Error', err));
    await client.connect();
  }
  return client;
}

export default async function handler(req, res) {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return res.status(500).json({ error: "REDIS_URL not configured." });
  }

  try {
    const redis = await getRedisClient();
    
    // Fetch all members of the sorted set
    const raw = await redis.zRangeWithScores('leaderboard', 0, -1);
    
    // Filter members starting with "TESTER:"
    const toRemove = raw.filter(entry => entry.value.startsWith("TESTER:"));
    
    const removed = [];
    for (const entry of toRemove) {
      await redis.zRem('leaderboard', entry.value);
      removed.push(entry.value);
    }
    
    return res.status(200).json({ status: "success", removed });
  } catch (error) {
    console.error("Remove Tester Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
