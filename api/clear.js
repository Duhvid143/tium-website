import { createClient } from 'redis';

let client = null;

async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL
    });
    await client.connect();
  }
  return client;
}

export default async function handler(req, res) {
  try {
    const redis = await getRedisClient();
    const result = await redis.del('leaderboard');
    return res.status(200).json({ status: "success", deleted: result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
