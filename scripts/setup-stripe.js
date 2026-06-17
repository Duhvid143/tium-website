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

async function setupStripe() {
  try {
    console.log("Setting up TT-01 on Stripe...");

    // 1. Check if the product already exists
    let product;
    const products = await stripe.products.list({ limit: 100 });
    product = products.data.find(p => p.name === 'TT-01');

    if (product) {
      console.log(`Product already exists: ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: 'TT-01',
        description: 'A Thinking Medium Word Search Tee. Try to solve this.',
        images: ['https://athinkingmedium.com/assets/tium-shirt.jpg'],
        metadata: {
          brand: 'TIUM_'
        }
      });
      console.log(`Product created: ${product.id}`);
    }

    // 2. Check or create prices for sizes S, M, L
    const sizePrices = {
      'S': 5000, // $50.00
      'M': 5000, // $50.00
      'L': 5000  // $50.00
    };
    const priceMap = {};

    const prices = await stripe.prices.list({ product: product.id, limit: 100 });

    for (const size of Object.keys(sizePrices)) {
      let price = prices.data.find(p => p.metadata && p.metadata.size === size);

      if (price) {
        console.log(`Price already exists for size ${size}: ${price.id}`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: sizePrices[size],
          currency: 'usd',
          metadata: { size }
        });
        console.log(`Price created for size ${size}: ${price.id}`);
      }
      priceMap[size] = price.id;
    }

    // 3. Write results to config file
    const configPath = path.resolve(process.cwd(), 'stripe-prices.json');
    fs.writeFileSync(configPath, JSON.stringify(priceMap, null, 2), 'utf-8');
    console.log(`Stripe Price IDs written to: ${configPath}`);
    console.log(JSON.stringify(priceMap, null, 2));

  } catch (error) {
    console.error("Stripe setup error:", error);
    process.exit(1);
  }
}

setupStripe();
