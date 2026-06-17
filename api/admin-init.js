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
  const { secret } = req.query;
  
  if (secret !== 'tium_secret_reset_2026_init') {
    return res.status(403).json({ error: "Unauthorized access." });
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return res.status(500).json({ error: "REDIS_URL not configured." });
  }

  try {
    const redis = await getRedisClient();
    
    await redis.set('stock:S', 8);
    await redis.set('stock:M', 8);
    await redis.set('stock:L', 8);
    
    const stockS = await redis.get('stock:S');
    const stockM = await redis.get('stock:M');
    const stockL = await redis.get('stock:L');

    return res.status(200).json({
      message: "Database stock initialized successfully.",
      inventory: {
        S: parseInt(stockS, 10),
        M: parseInt(stockM, 10),
        L: parseInt(stockL, 10)
      }
    });
  } catch (error) {
    console.error("Initialization error:", error);
    return res.status(500).json({ error: error.message });
  }
}
