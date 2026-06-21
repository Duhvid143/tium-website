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
    return res.status(455).json({ error: 'Method not allowed.' });
  }

  const { password, S, M, L } = req.body;

  // 1. Password Verification
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ADMIN_PASSWORD is not configured on the server.");
    return res.status(500).json({ error: 'Admin password not configured on server.' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin password.' });
  }

  // 2. Validate Inputs
  const parsedS = parseInt(S, 10);
  const parsedM = parseInt(M, 10);
  const parsedL = parseInt(L, 10);

  if (isNaN(parsedS) || isNaN(parsedM) || isNaN(parsedL)) {
    return res.status(400).json({ error: 'Invalid input values. All quantities must be numbers.' });
  }

  if (parsedS < 0 || parsedM < 0 || parsedL < 0) {
    return res.status(400).json({ error: 'Quantities cannot be negative.' });
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("REDIS_URL not configured. Simulating success locally.");
    return res.status(200).json({ status: 'local_success', inventory: { S: parsedS, M: parsedM, L: parsedL } });
  }

  try {
    const redis = await getRedisClient();

    // 3. Save to Redis
    await redis.set('stock:S', parsedS);
    await redis.set('stock:M', parsedM);
    await redis.set('stock:L', parsedL);

    console.log(`Inventory successfully updated by Admin to S: ${parsedS}, M: ${parsedM}, L: ${parsedL}`);

    return res.status(200).json({
      status: 'success',
      message: 'Inventory updated successfully.',
      inventory: { S: parsedS, M: parsedM, L: parsedL }
    });
  } catch (error) {
    console.error("Failed to update inventory in Redis:", error);
    return res.status(500).json({ error: 'Database connection error.' });
  }
}
