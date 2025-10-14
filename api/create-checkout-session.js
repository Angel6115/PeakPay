// api/create-checkout-session.js
import Stripe from 'stripe';
import { URL } from 'url';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Normaliza role/type recibido (acepta ES y EN)
function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['creator', 'creador', 'c'].includes(v)) return 'creator';
  if (['user', 'usuario', 'u', 'fan'].includes(v)) return 'user';
  return 'user';
}

// Intenta determinar un BASE_URL razonable
function resolveBaseUrl(req) {
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;

  // Fallback: intenta con Referer
  const referer = req.headers.referer || '';
  try {
    if (referer) {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    }
  } catch (_) {}

  // Prod (ajústalo a tu dominio si usas otro)
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://peak-pay.vercel.app';
}

export default async function handler(req, res) {
  // CORS básico
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};

    // role puede venir como: body.role | body.type | ?role | ?type | ?t
    const rawRole =
      body.role ?? body.type ?? req.query?.role ?? req.query?.type ?? req.query?.t ?? '';
    const role = normalizeRole(rawRole);

    const customerEmail = String(body.email || '').trim();
    if (!customerEmail) return res.status(400).json({ error: 'Email requerido' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // ✅ NUEVO: Recibir userId de Supabase
    const userId = body.userId || '';

    const BASE_URL = resolveBaseUrl(req);

    // Pricing
    const isCreator = role === 'creator';
    const unitAmount = isCreator ? 499 : 999;
    const productName = isCreator
      ? 'PeekPay Early Access (Creator)'
      : 'PeekPay Early Access (User)';

    // Rutas de retorno
    const successUrl = `${BASE_URL}/payment-complete.html?session_id={CHECKOUT_SESSION_ID}&t=${isCreator ? 'creator' : 'user'}&e=${encodeURIComponent(customerEmail)}`;
    const cancelUrl = `${BASE_URL}/signup.html?canceled=1&t=${isCreator ? 'creator' : 'user'}`;

    // Imagen del producto
    const productImage = `${BASE_URL}/assets/brand/peekpay-logo-h.svg`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: 'Acceso anticipado + 1,000 Peak Credits + Beneficios exclusivos',
              images: [productImage],
            },
            unit_amount: unitAmount,
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
        userId: userId, // ✅ NUEVO: Guardar userId en metadata para el webhook
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    return res.status(500).json({ error: 'Error al crear sesión de pago', message: err.message });
  }
}