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

async function checkPriceStatus() {
  const pricesJsonPath = path.resolve(process.cwd(), 'stripe-prices.json');
  const pricesData = JSON.parse(fs.readFileSync(pricesJsonPath, 'utf-8'));
  const priceIds = Object.values(pricesData);

  for (const id of priceIds) {
    try {
      const price = await stripe.prices.retrieve(id);
      console.log(`Price ID: ${id}`);
      console.log(`  Active: ${price.active}`);
      console.log(`  Unit Amount: $${(price.unit_amount / 100).toFixed(2)}`);
      console.log(`  Product: ${price.product}`);
    } catch (err) {
      console.error(`Error retrieving price ${id}:`, err.message);
    }
  }
}

checkPriceStatus();
