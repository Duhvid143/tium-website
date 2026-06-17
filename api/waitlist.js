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
  if (req.method !== 'POST') {
    return res.status(455).json({ error: "Method not allowed." });
  }

  const { email, size } = req.body;

  if (!email || !size) {
    return res.status(400).json({ error: "Email and size are required." });
  }

  // Simple validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  if (!validSizes.includes(size.toUpperCase())) {
    return res.status(400).json({ error: "Invalid size selection." });
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn("REDIS_URL environment variable is not configured for waitlist.");
    return res.status(200).json({ status: "local_only", message: "Database not configured. Saved locally (simulate success)." });
  }

  try {
    const redis = await getRedisClient();
    const entry = {
      email: email.trim().toLowerCase(),
      size: size.toUpperCase(),
      timestamp: Date.now()
    };

    // Store as JSON in a Redis list named 'waitlist'
    await redis.rPush('waitlist', JSON.stringify(entry));

    return res.status(200).json({ status: "success", message: "Successfully added to waitlist." });
  } catch (error) {
    console.error("Waitlist API Error:", error);
    return res.status(500).json({ error: "Internal server error connecting to database." });
  }
}
