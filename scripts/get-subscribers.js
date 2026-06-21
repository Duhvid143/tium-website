import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

// Load Redis URL from the environment files in priority order
function getRedisUrl() {
  const envFiles = [
    '.env.production.local',
    '.env.vercel-production.local',
    '.env.local',
    '.env.development.local',
    '.env.vercel.local'
  ];

  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/REDIS_URL=["']?([^"'\s]+)["']?/);
        if (match && match[1]) {
          console.log(`Using database configuration from: ${file}`);
          return match[1];
        }
      }
    } catch (err) {
      // Ignore and try next file
    }
  }
  return process.env.REDIS_URL;
}

const redisUrl = getRedisUrl();

if (!redisUrl) {
  console.error("Error: REDIS_URL not configured. Make sure you have a valid .env file in the root folder.");
  process.exit(1);
}

const client = createClient({ url: redisUrl });

async function viewNewsletter() {
  try {
    console.log("Connecting to Redis...");
    await client.connect();

    console.log("Retrieving newsletter subscribers...");
    // Retrieve all entries from the Redis list named 'newsletter'
    const rawEntries = await client.lRange('newsletter', 0, -1);

    if (rawEntries.length === 0) {
      console.log("\nNo subscribers found in the database yet.");
      return;
    }

    const subscribers = rawEntries.map((entry, index) => {
      try {
        const parsed = JSON.parse(entry);
        return {
          Index: index + 1,
          Email: parsed.email,
          Phone: parsed.phone || 'N/A',
          Source: parsed.source,
          Date: new Date(parsed.timestamp).toLocaleString()
        };
      } catch (err) {
        return {
          Index: index + 1,
          RawData: entry,
          Error: "Corrupted entry format"
        };
      }
    });

    console.log(`\nFound ${subscribers.length} subscriber(s):\n`);
    console.table(subscribers);

    // Export to CSV if --csv parameter is passed
    const args = process.argv.slice(2);
    if (args.includes('--csv')) {
      const csvHeaders = 'Index,Email,Phone,Source,Date\n';
      const csvRows = subscribers.map(s => 
        `"${s.Index}","${s.Email}","${s.Phone}","${s.Source}","${s.Date}"`
      ).join('\n');
      
      const csvPath = path.resolve(process.cwd(), 'subscribers.csv');
      fs.writeFileSync(csvPath, csvHeaders + csvRows, 'utf-8');
      console.log(`\nExported successfully to: ${csvPath}\n`);
    } else {
      console.log("\nTip: Run this script with '--csv' (node scripts/get-subscribers.js --csv) to export the list to a CSV file.");
    }

  } catch (err) {
    console.error("Failed to connect or retrieve data from Redis:", err.message);
  } finally {
    await client.disconnect();
  }
}

viewNewsletter();
