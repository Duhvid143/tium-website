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

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.error("Resend API key is missing. Skipping email sending.");
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `TIUM Shop <${from}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Resend API error: ${errorText}`);
    } else {
      const data = await response.json();
      console.log(`Email sent successfully: ${data.id}`);
    }
  } catch (error) {
    console.error("Failed to send email via Resend:", error);
  }
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

  // 2. Listen for Checkout Session Completion (Authorized Payment)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const size = session.metadata?.size;
    const merchantEmail = process.env.MERCHANT_EMAIL || 'david@cadafilms.com';
    
    console.log(`Checkout session completed! Session ID: ${session.id} | Size: ${size} | Amount: $${(session.amount_total / 100).toFixed(2)}`);
    
    // Payment is authorized. Since stock was already decremented upon session creation,
    // we keep the reduction as final.
    
    // Send email notification to Merchant (You)
    const formattedAddress = `
      ${session.shipping_details?.name || 'N/A'}<br>
      ${session.shipping_details?.address?.line1 || 'N/A'}<br>
      ${session.shipping_details?.address?.line2 ? session.shipping_details.address.line2 + '<br>' : ''}
      ${session.shipping_details?.address?.city || 'N/A'}, ${session.shipping_details?.address?.state || ''} ${session.shipping_details?.address?.postal_code || ''}<br>
      ${session.shipping_details?.address?.country || 'N/A'}
    `;

    await sendEmail({
      to: merchantEmail,
      subject: `[TIUM Shop] New Order Authorized - Size ${size}`,
      html: `
        <h3>New Order Authorized!</h3>
        <p>A customer has authorized a payment for a <strong>TIUM_ Word Search Tee (Size ${size})</strong>.</p>
        <p><strong>Order Details:</strong></p>
        <ul>
          <li><strong>Session ID:</strong> ${session.id}</li>
          <li><strong>Size:</strong> ${size}</li>
          <li><strong>Amount:</strong> $${(session.amount_total / 100).toFixed(2)}</li>
          <li><strong>Customer:</strong> ${session.customer_details?.name || 'N/A'} (${session.customer_details?.email || 'N/A'})</li>
        </ul>
        <p><strong>Shipping Address:</strong></p>
        <p>${formattedAddress}</p>
        <p><strong>Next Step:</strong> Review stock, package the item, and click <strong>Capture</strong> in your Stripe Dashboard to charge the customer and trigger the shipment notification email.</p>
      `
    });
  }

  // 3. Listen for Payment Intent Capture Success (Charge & Fulfill)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    // Find the associated checkout session to fetch customer details and size metadata
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntent.id,
        limit: 1,
      });

      const session = sessions.data[0];
      if (session) {
        const customerEmail = session.customer_details?.email;
        const customerName = session.customer_details?.name || session.shipping_details?.name || 'there';
        const size = session.metadata?.size || 'M';

        console.log(`Payment captured! Session ID: ${session.id} | Email: ${customerEmail} | Size: ${size}`);

        if (customerEmail) {
          await sendEmail({
            to: customerEmail,
            subject: 'Your TIUM_ order is shipping today!',
            html: `
              <h3>Good news, ${customerName}!</h3>
              <p>We have processed your payment of <strong>$${(session.amount_total / 100).toFixed(2)}</strong> for the <strong>TIUM_ Word Search Tee (Size ${size})</strong>.</p>
              <p>Your package is prepared and is <strong>shipping today!</strong></p>
              <p>Thank you for supporting A Thinking Medium.</p>
            `
          });
        }
      }
    } catch (err) {
      console.error('Error handling payment_intent.succeeded:', err);
    }
  }

  // 4. Listen for Payment Intent Cancellation (Restore Stock)
  if (event.type === 'payment_intent.canceled') {
    const paymentIntent = event.data.object;

    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntent.id,
        limit: 1,
      });

      const session = sessions.data[0];
      if (session) {
        const size = session.metadata?.size;
        console.log(`Payment intent canceled! Session ID: ${session.id} | Size: ${size}`);

        if (size && ['S', 'M', 'L'].includes(size) && redisUrl) {
          const redis = await getRedisClient();
          const stockKey = `stock:${size}`;
          const newStock = await redis.incr(stockKey);
          console.log(`Successfully returned size ${size} to stock after authorization cancellation. New stock count: ${newStock}`);
        }
      }
    } catch (err) {
      console.error('Error handling payment_intent.canceled:', err);
    }
  }

  return res.status(200).json({ received: true });
}
