import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';

// Load prices config
const pricesPath = path.join(process.cwd(), 'stripe-prices.json');
let prices = {};
try {
  prices = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
} catch (err) {
  console.error("Failed to read stripe-prices.json:", err);
}

let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL
    });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(455).json({ error: 'Method not allowed.' });
  }

  const { size } = req.body;
  if (!size || !['S', 'M', 'L'].includes(size)) {
    return res.status(400).json({ error: 'Invalid size selected.' });
  }

  const priceId = prices[size];
  if (!priceId) {
    return res.status(400).json({ error: 'Price ID not configured for this size.' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("STRIPE_SECRET_KEY is not defined in environment.");
    return res.status(500).json({ error: 'Stripe configuration missing on server.' });
  }

  const stripe = new Stripe(stripeSecret);
  const redisUrl = process.env.REDIS_URL;
  let redis = null;

  // 1. Reserve Stock in Redis first
  if (redisUrl) {
    try {
      redis = await getRedisClient();
      const stockKey = `stock:${size}`;
      
      // Get current stock, default to size-specific value if not initialized
      const defaults = { S: 3, M: 6, L: 4 };
      let currentStock = await redis.get(stockKey);
      if (currentStock === null) {
        const defaultQty = defaults[size] || 6;
        await redis.set(stockKey, defaultQty);
        currentStock = String(defaultQty);
      }

      const stockNum = parseInt(currentStock, 10);
      if (stockNum <= 0) {
        return res.status(400).json({ error: `Size ${size} is out of stock.` });
      }

      // Decrement to reserve
      await redis.decr(stockKey);
      console.log(`Reserved 1 item for size ${size}. Temporary stock level: ${stockNum - 1}`);
    } catch (dbErr) {
      console.error("Redis connection error during checkout stock check:", dbErr);
      // We fail closed if Redis is down to prevent overselling, but in dev it fallbacks.
      return res.status(500).json({ error: 'Database connection failed. Please try again.' });
    }
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const origin = req.headers.origin || `${protocol}://${host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      payment_intent_data: {
        capture_method: 'manual', // Hold funds, capture later when shipped
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/shop.html?success=true`,
      cancel_url: `${origin}/shop.html`,
      shipping_address_collection: {
        allowed_countries: ['US'], // Restrict address collection to United States only
      },
      billing_address_collection: 'required',
      shipping_options: process.env.SHIPPING_RATE_US
        ? [
            { shipping_rate: process.env.SHIPPING_RATE_US },
          ]
        : [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: {
                  amount: 500, // $5.00 USD fallback standard rate
                  currency: 'usd',
                },
                display_name: 'Standard Shipping',
                delivery_estimate: {
                  minimum: { unit: 'business_day', value: 3 },
                  maximum: { unit: 'business_day', value: 7 },
                },
              },
            },
          ],
      metadata: {
        product: 'TT-01', // Updated to match user's Stripe product name
        size: size,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe session creation error:', error);
    
    // 2. Rollback Redis stock reservation if Stripe fails
    if (redis && redisUrl) {
      try {
        const stockKey = `stock:${size}`;
        await redis.incr(stockKey);
        console.log(`Stripe session failed. Rolled back stock reservation for size ${size}.`);
      } catch (rollbackErr) {
        console.error("Failed to rollback stock reservation in Redis:", rollbackErr);
      }
    }
    
    return res.status(500).json({ error: 'Failed to initiate checkout session.' });
  }
}
