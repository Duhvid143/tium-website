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
    console.warn("REDIS_URL environment variable is not configured.");
    if (req.method === 'GET') {
      return res.status(200).json([]);
    }
    return res.status(200).json({ status: "local_only", message: "Database not configured. Saving locally." });
  }

  try {
    const redis = await getRedisClient();

    // ----------------------------------------------------------------------
    // GET: Fetch top 5 sorted scores
    // ----------------------------------------------------------------------
    if (req.method === 'GET') {
      const raw = await redis.zRangeWithScores('leaderboard', 0, 4);

      const scores = raw.map(entry => {
        const name = entry.value.split(":")[0];
        const time = entry.score;
        return { name, time };
      });

      return res.status(200).json(scores);
    }

    // ----------------------------------------------------------------------
    // POST: Save a new score
    // ----------------------------------------------------------------------
    if (req.method === 'POST') {
      const { name, time } = req.body;

      if (!name || typeof time !== 'number') {
        return res.status(400).json({ error: "Invalid name or time parameters." });
      }

      // Sanitize input: Alphanumeric only, uppercase, max 12 characters
      const sanitizedName = name.trim().replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().substring(0, 12) || "GUEST";
      const timestamp = Date.now();
      const member = `${sanitizedName}:${timestamp}`;

      await redis.zAdd('leaderboard', {
        score: time,
        value: member
      });

      return res.status(200).json({ status: "success", name: sanitizedName, time });
    }

    return res.status(455).json({ error: "Method not allowed." });

  } catch (error) {
    console.error("Leaderboard API Error:", error);
    return res.status(500).json({ error: "Internal server error connecting to database." });
  }
}
