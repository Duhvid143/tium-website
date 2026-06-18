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
  if (req.method !== 'GET') {
    return res.status(455).json({ error: "Method not allowed." });
  }

  const redisUrl = process.env.REDIS_URL;

  // Local fallback if database is not configured
  if (!redisUrl) {
    console.warn("REDIS_URL environment variable is not configured. Returning mock inventory.");
    return res.status(200).json({ S: 6, M: 6, L: 6 });
  }

  try {
    const redis = await getRedisClient();

    // Fetch stock levels
    let stockS = await redis.get('stock:S');
    let stockM = await redis.get('stock:M');
    let stockL = await redis.get('stock:L');

    // Initialize to default stock levels (All S, M, L have 6 items in stock)
    if (stockS === null) {
      await redis.set('stock:S', 6);
      stockS = '6';
    }
    if (stockM === null) {
      await redis.set('stock:M', 6);
      stockM = '6';
    }
    if (stockL === null) {
      await redis.set('stock:L', 6);
      stockL = '6';
    }

    return res.status(200).json({
      S: parseInt(stockS, 10),
      M: parseInt(stockM, 10),
      L: parseInt(stockL, 10)
    });

  } catch (error) {
    console.error("Inventory API Error:", error);
    return res.status(500).json({ error: "Internal server error connecting to database." });
  }
}
