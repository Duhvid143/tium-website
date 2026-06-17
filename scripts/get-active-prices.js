import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

// Parse .env.development.local manually to get the Stripe Secret Key
const envPath = path.resolve(process.cwd(), '.env.development.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const secretKeyMatch = envContent.match(/STRIPE_SECRET_KEY=["']?([^"'\s]+)["']?/);

if (!secretKeyMatch) {
  console.error("Error: STRIPE_SECRET_KEY not found in .env.development.local");
  process.exit(1);
}

const stripeSecretKey = secretKeyMatch[1];
const stripe = new Stripe(stripeSecretKey);

async function getActivePrices() {
  try {
    const productId = 'prod_UiaQTZEkvwjybh'; // TT-01
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100
    });

    console.log(`\nActive Prices for TT-01 (${productId}):`);
    for (const p of prices.data) {
      console.log(`- Price ID: ${p.id} | Amount: $${(p.unit_amount / 100).toFixed(2)} | Metadata:`, p.metadata);
    }
  } catch (err) {
    console.error("Error fetching active prices:", err.message);
  }
}

getActivePrices();
