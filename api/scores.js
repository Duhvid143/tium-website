// TIUM_ Word Hunt - Serverless Leaderboard API
// Powered by Vercel KV (Redis REST API)

const DEFAULT_LEADERBOARD = [
  { name: "SOCRATES", time: 94 },
  { name: "PLATO", time: 112 },
  { name: "DIOTIMA", time: 138 },
  { name: "SENECA", time: 165 },
  { name: "GUEST", time: 210 }
];

export default async function handler(req, res) {
  let url = process.env.KV_REST_API_URL;
  let token = process.env.KV_REST_API_TOKEN;

  // Support REDIS_URL (which standard Redis / Upstash integrations provide)
  if (!url || !token) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const match = redisUrl.match(/^rediss?:\/\/(?:([^:]*):)?([^@]+)@([^:]+)(?::(\d+))?$/);
      if (match) {
        token = match[2];
        const host = match[3];
        url = `https://${host}`;
        console.log("REDIS_URL host:", host);
      }
    }
  }

  if (!url || !token) {
    // Fallback if database environment variables are not available
    console.warn("Database environment variables are not configured.");
    if (req.method === 'GET') {
      return res.status(200).json(DEFAULT_LEADERBOARD);
    }
    return res.status(200).json({ status: "local_only", message: "Database not configured. Saving locally." });
  }

  try {
    // ----------------------------------------------------------------------
    // GET: Fetch top 5 sorted scores
    // ----------------------------------------------------------------------
    if (req.method === 'GET') {
      const response = await fetch(`${url}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(["ZRANGE", "leaderboard", 0, 4, "WITHSCORES"])
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const raw = data.result || [];
      const scores = [];

      // Parse Redis response: flat array of [member, score, member, score, ...]
      for (let i = 0; i < raw.length; i += 2) {
        const member = raw[i];
        const time = parseInt(raw[i + 1], 10);
        const name = member.split(":")[0];
        scores.push({ name, time });
      }

      // Self-seeding: If database is empty, seed default community scores
      if (scores.length === 0) {
        const pipeline = DEFAULT_LEADERBOARD.map((entry, idx) => {
          // Space out timestamps slightly to ensure stable ordering
          const timestamp = Date.now() - (5 - idx) * 1000;
          return ["ZADD", "leaderboard", entry.time, `${entry.name}:${timestamp}`];
        });

        // Run pipeline seed on Upstash KV
        await fetch(`${url}/pipeline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(pipeline)
        });

        return res.status(200).json(DEFAULT_LEADERBOARD);
      }

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

      // ZADD leaderboard <time> "<name>:<timestamp>"
      const response = await fetch(`${url}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(["ZADD", "leaderboard", time, `${sanitizedName}:${timestamp}`])
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      return res.status(200).json({ status: "success", name: sanitizedName, time });
    }

    return res.status(455).json({ error: "Method not allowed." });

  } catch (error) {
    console.error("Leaderboard API Error:", error);
    return res.status(500).json({ error: "Internal server error connecting to database." });
  }
}
