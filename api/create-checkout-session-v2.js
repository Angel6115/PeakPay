// /api/create-checkout-session-v2.js  (ESM, default export)
import Stripe from 'stripe';

export const config = {
  api: { bodyParser: true },   // JSON body
  // No forzamos 'edge'; Node.js por defecto
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['creator', 'creador', 'c'].includes(v)) return 'creator';
  if (['user', 'usuario', 'u', 'fan'].includes(v)) return 'user';
  return 'user';
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://peek-pay.com';
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email   = (body.email   || '').toString().trim();
    const userId  = (body.userId  || '').toString().trim();
    const priceId = (body.priceId || '').toString().trim();
    const roleRaw = (body.role || body.type || 'user').toString();
    const role    = normalizeRole(roleRaw);

    if (!email) return res.status(400).json({ error: 'Email requerido' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
    if (!priceId || !priceId.startsWith('price_')) {
      return res.status(400).json({ error: 'priceId requerido (formato price_...)' });
    }

    // Log diagnóstico visible en Vercel
    console.log('[ccs-v2] body', {
      emailPresent: !!email, userIdPresent: !!userId, priceId, role, ts: new Date().toISOString()
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],  // <-- SIEMPRE el price (evita 9.99)
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      success_url: `${baseUrl()}/payment-complete.html?session_id={CHECKOUT_SESSION_ID}&t=${role}&e=${encodeURIComponent(email)}`,
      cancel_url: `${baseUrl()}/signup.html?canceled=1&t=${role}`,
      metadata: {
        email, userId, type: role === 'creator' ? 'creator' : 'user',
        product: role === 'creator' ? 'early_access_creator' : 'early_access_user',
        endpoint: 'v2-esm'
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[ccs-v2] error', { message: err?.message, stack: err?.stack, name: err?.name });
    return res.status(500).json({ error: 'FUNCTION_INVOCATION_FAILED', message: err?.message || 'Unknown error' });
  }
}
