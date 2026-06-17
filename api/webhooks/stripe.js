import Stripe from 'stripe';
import { createClient } from 'redis';

// Stripe webhook handler expects raw body for signature verification.
export const config = {
  api: {
    bodyParser: false, // Disables Vercel's default JSON parser to get raw body
  },
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
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

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecret) {
    console.error("STRIPE_SECRET_KEY is missing on server.");
    return res.status(500).json({ error: 'Stripe keys not configured.' });
  }

  const stripe = new Stripe(stripeSecret);
  const sig = req.headers['stripe-signature'];
  let event;
  let rawBody;

  try {
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (typeof req.body === 'object' && req.body !== null) {
      // Vercel CLI local server parses the body automatically
      rawBody = Buffer.from(JSON.stringify(req.body));
    } else {
      rawBody = await getRawBody(req);
    }

    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // Fallback for local testing or if webhook secret is not configured yet
      console.warn("STRIPE_WEBHOOK_SECRET or stripe-signature missing. Parsing event unverified.");
      const json = JSON.parse(rawBody.toString('utf8'));
      event = json;
    }
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Processing Stripe webhook event: ${event.type}`);
  const redisUrl = process.env.REDIS_URL;

  // 1. Listen for Checkout Session Expiration (Restore Stock)
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const size = session.metadata?.size;
    const product = session.metadata?.product;

    console.log(`Checkout session expired! Session ID: ${session.id} | Size: ${size}`);

    if (size && ['S', 'M', 'L'].includes(size) && redisUrl) {
      try {
        const redis = await getRedisClient();
        const stockKey = `stock:${size}`;
        const newStock = await redis.incr(stockKey);
        console.log(`Successfully returned size ${size} to stock. New stock count: ${newStock}`);
      } catch (dbErr) {
        console.error(`Failed to increment stock in Redis for size ${size} on session expiration:`, dbErr);
      }
    }
  }

  // 2. Listen for Checkout Session Completion (Confirm Payment)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const size = session.metadata?.size;
    
    console.log(`Checkout session completed! Session ID: ${session.id} | Size: ${size} | Amount: $${(session.amount_total / 100).toFixed(2)}`);
    
    // Payment is confirmed. Since stock was already decremented upon session creation,
    // we keep the reduction as final.
  }

  return res.status(200).json({ received: true });
}
