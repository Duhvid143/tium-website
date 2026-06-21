import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

// Load Redis URL from environment files in priority order
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

async function runMigration() {
  try {
    console.log("Connecting to Redis...");
    await client.connect();

    console.log("Fetching existing waitlist entries...");
    const rawWaitlist = await client.lRange('waitlist', 0, -1);
    console.log(`Found ${rawWaitlist.length} entry/entries in waitlist.`);

    console.log("Fetching existing newsletter subscribers...");
    const rawNewsletter = await client.lRange('newsletter', 0, -1);
    console.log(`Found ${rawNewsletter.length} entry/entries in newsletter.`);

    // Build a Set of normalized emails already subscribed to the newsletter for deduplication
    const subscribedEmails = new Set();
    rawNewsletter.forEach(entry => {
      try {
        const parsed = JSON.parse(entry);
        if (parsed.email) {
          subscribedEmails.add(parsed.email.trim().toLowerCase());
        }
      } catch (err) {
        // Skip corrupted entries
      }
    });

    let migratedCount = 0;
    console.log("\nProcessing migration...");

    for (const rawEntry of rawWaitlist) {
      try {
        const parsed = JSON.parse(rawEntry);
        if (!parsed.email) continue;

        const emailNormalized = parsed.email.trim().toLowerCase();

        // Check if the user is already in the newsletter list
        if (!subscribedEmails.has(emailNormalized)) {
          const size = parsed.size ? parsed.size.toUpperCase() : 'UNKNOWN';
          const newsletterEntry = {
            email: emailNormalized,
            phone: null,
            source: `waitlist_${size}`,
            timestamp: parsed.timestamp || Date.now()
          };

          // Push to the 'newsletter' list in Redis
          await client.rPush('newsletter', JSON.stringify(newsletterEntry));
          
          // Add to set to prevent duplicate migrations in the same run
          subscribedEmails.add(emailNormalized);
          migratedCount++;
          console.log(`  Migrated: ${emailNormalized} (from size ${size})`);
        } else {
          console.log(`  Skipped: ${emailNormalized} (already subscribed)`);
        }
      } catch (err) {
        console.error("  Error parsing waitlist entry:", rawEntry, err.message);
      }
    }

    console.log(`\nMigration completed successfully!`);
    console.log(`Total new subscribers added to newsletter: ${migratedCount}`);

  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    await client.disconnect();
  }
}

runMigration();
