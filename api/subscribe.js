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

  const { email, phone, source } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  // Validate phone number if provided (or if required by source)
  const isFooter = source === 'footer';
  
  if (isFooter && !phone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  if (phone) {
    const phoneRegex = /^\+?[0-9\s\-()]{7,18}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number format." });
    }
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn("REDIS_URL environment variable is not configured for newsletter.");
    return res.status(200).json({ status: "local_only", message: "Database not configured. Saved locally (simulate success)." });
  }

  try {
    const redis = await getRedisClient();
    const entry = {
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      source: source || 'unknown',
      timestamp: Date.now()
    };

    // Store as JSON in a Redis list named 'newsletter'
    await redis.rPush('newsletter', JSON.stringify(entry));

    return res.status(200).json({ status: "success", message: "Successfully subscribed to the newsletter." });
  } catch (error) {
    console.error("Newsletter API Error:", error);
    return res.status(500).json({ error: "Internal server error connecting to database." });
  }
}
