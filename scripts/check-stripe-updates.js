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

async function checkStripeUpdates() {
  try {
    console.log("Fetching latest product details from Stripe...");
    
    const products = await stripe.products.list({ limit: 100 });
    console.log(`\nFound ${products.data.length} products on your Stripe account:\n`);

    for (const p of products.data) {
      console.log(`Product: "${p.name}" (ID: ${p.id})`);
      console.log(`  Description: ${p.description || 'No description'}`);
      console.log(`  Default Price ID: ${p.default_price || 'None'}`);
      
      // Fetch prices for this product
      const prices = await stripe.prices.list({ product: p.id });
      console.log(`  Prices:`);
      for (const price of prices.data) {
        const formattedAmount = (price.unit_amount / 100).toFixed(2);
        console.log(`    - ID: ${price.id} | Amount: $${formattedAmount} ${price.currency.toUpperCase()} | Metadata:`, price.metadata);
      }
      console.log("-".repeat(40));
    }

  } catch (error) {
    console.error("Error fetching from Stripe:", error);
    process.exit(1);
  }
}

checkStripeUpdates();
