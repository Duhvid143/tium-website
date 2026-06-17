import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

// Load managed prices config
const pricesPath = path.join(process.cwd(), 'stripe-managed-prices.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
} catch (err) {
  console.error("Failed to read stripe-managed-prices.json:", err);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(455).json({ error: 'Method not allowed.' });
  }

  const priceId = config.defaultPriceId;
  if (!priceId) {
    return res.status(400).json({ error: 'Hamlet price ID not configured on server.' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error("STRIPE_SECRET_KEY is not defined in environment.");
    return res.status(500).json({ error: 'Stripe configuration missing on server.' });
  }

  const stripe = new Stripe(stripeSecret);

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/shop.html?success=true`,
      cancel_url: `${req.headers.origin}/shop.html`,
      managed_payments: {
        enabled: true
      }
    }, {
      stripeVersion: '2026-02-25.preview'
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Managed Payments Checkout Session error:', error);
    return res.status(500).json({ error: 'Failed to initiate managed checkout session.' });
  }
}
