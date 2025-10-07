// api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

export default async function handler(req, res) {
  // CORS básico
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) return res.status(400).json({ error: 'Email inválido' });

    // Detecta local vs prod correctamente
    const origin = req.headers.origin || '';
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    // En prod: archivos de public están en raíz → /gracias.html
    // En local (Vite): viven bajo /public → /public/gracias.html
    const BASE_URL = isLocal
      ? (origin || 'http://localhost:5173')
      : (process.env.NEXT_PUBLIC_BASE_URL || 'https://peak-pay.vercel.app');

      const PATH_PREFIX = isLocal ? '/public' : '';
      const successUrl = `${BASE_URL}/thankyou?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl  = `${BASE_URL}/signup`;

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'PeekPay Early Access',
            description: 'Acceso anticipado + 1,000 Peak Credits + Beneficios exclusivos',
            images: [`${BASE_URL}/peak1.png`],
          },
          unit_amount: 999,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { email, product: 'early_access' },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    return res.status(500).json({ error: 'Error al crear sesión de pago', message: err.message });
  }
}