import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

// Parse .env.development.local manually to get the Redis URL
const envPath = path.resolve(process.cwd(), '.env.development.local');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf-8');
} catch (err) {
  console.log("No env file found.");
}
const redisUrlMatch = envContent.match(/REDIS_URL=["']?([^"'\s]+)["']?/);
const redisUrl = redisUrlMatch ? redisUrlMatch[1] : process.env.REDIS_URL;

if (!redisUrl) {
  console.error("Error: REDIS_URL not configured. Cannot initialize database.");
  process.exit(1);
}

const client = createClient({ url: redisUrl });

async function initInventory() {
  try {
    console.log("Connecting to Redis...");
    await client.connect();

    console.log("Initializing stock levels...");
    await client.set('stock:S', 8); // 8 in inventory
    await client.set('stock:M', 8); // 8 in inventory
    await client.set('stock:L', 8); // 8 in inventory

    console.log("Stock levels initialized successfully:");
    console.log("  stock:S -> 8");
    console.log("  stock:M -> 8");
    console.log("  stock:L -> 8");

  } catch (err) {
    console.error("Failed to initialize inventory:", err.message);
  } finally {
    await client.disconnect();
  }
}

initInventory();
