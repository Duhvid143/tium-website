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

async function setupManagedPaymentsProduct() {
  try {
    console.log("Setting up Hamlet (e-book) on Stripe with Managed Payments parameters...");

    // 1. Check if the product already exists
    let product;
    const products = await stripe.products.list(
      { limit: 100 },
      { stripeVersion: '2026-02-25.preview' }
    );
    product = products.data.find(p => p.name === 'Hamlet (e-book)');

    if (product) {
      console.log(`Product already exists: ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: 'Hamlet (e-book)',
        description: 'A Shakespearean tragedy',
        tax_code: 'txcd_10103100',
        default_price_data: {
          unit_amount: 1000,
          currency: 'usd'
        }
      }, {
        stripeVersion: '2026-02-25.preview'
      });
      console.log(`Product created: ${product.id}`);
    }

    // 2. Fetch default price ID if product already existed
    let defaultPriceId = product.default_price;
    if (!defaultPriceId && product.id) {
      // If product exists but default price wasn't returned, retrieve the product details
      const retrieved = await stripe.products.retrieve(
        product.id,
        { stripeVersion: '2026-02-25.preview' }
      );
      defaultPriceId = retrieved.default_price;
    }

    const priceMap = {
      productId: product.id,
      defaultPriceId: defaultPriceId
    };

    // 3. Write results to config file
    const configPath = path.resolve(process.cwd(), 'stripe-managed-prices.json');
    fs.writeFileSync(configPath, JSON.stringify(priceMap, null, 2), 'utf-8');
    console.log(`Stripe Managed Payments configuration written to: ${configPath}`);
    console.log(JSON.stringify(priceMap, null, 2));

  } catch (error) {
    console.error("Stripe setup error:", error);
    process.exit(1);
  }
}

setupManagedPaymentsProduct();
