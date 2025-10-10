// api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

export default async function handler(req, res) {
  // CORS básico para formularios estáticos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = (req.body || {});
    // Acepta varias formas de indicar el tipo
    const rawType =
      (body.type ?? body.role ?? req.query?.t ?? '').toString().trim().toLowerCase();

    const customerEmail = (body.email || '').toString().trim();
    if (!customerEmail) return res.status(400).json({ error: 'Email requerido' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // creator => 4.99 USD, user => 9.99 USD
    const isCreator = rawType === 'creator';
    const unitAmount = isCreator ? 499 : 999;
    const productName = isCreator ? 'PeekPay Early Access (Creator)' : 'PeekPay Early Access (User)';

    // Detecta local vs prod (para construir URLs de retorno)
    const origin = req.headers.origin || '';
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    const BASE_URL = isLocal
      ? (origin || 'http://localhost:5173')
      : (process.env.NEXT_PUBLIC_BASE_URL || 'https://peak-pay.vercel.app');

    // Éxito/cancel — agregamos tipo y email para redirigir bien en payment-complete
    const successUrl = `${BASE_URL}/payment-complete.html?session_id={CHECKOUT_SESSION_ID}&t=${isCreator ? 'creator' : 'user'}&e=${encodeURIComponent(customerEmail)}`;
    const cancelUrl  = isCreator
      ? `${BASE_URL}/creator-signup.html?canceled=1`
      : `${BASE_URL}/signup.html?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      payment_method_types: ['card'],
      allow_promotion_codes: true,     // SIEMPRE permitir promo codes
      automatic_tax: { enabled: false }, // desactiva cálculo automático de impuestos
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: 'Acceso anticipado + 1,000 Peak Credits + Beneficios exclusivos',
              images: [`${BASE_URL}/peak1.png`],
            },
            unit_amount: unitAmount, // 499 o 999
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        email: customerEmail,
        product: isCreator ? 'early_access_creator' : 'early_access_user',
        type: isCreator ? 'creator' : 'user',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    return res.status(500).json({ error: 'Error al crear sesión de pago', message: err.message });
  }
}
