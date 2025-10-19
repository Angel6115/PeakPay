// /api/create-checkout-session.js
import Stripe from 'stripe';
import { URL } from 'url';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// UUID (v1–v5)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Normaliza role/type recibido (ES/EN)
function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['creator', 'creador', 'c'].includes(v)) return 'creator';
  if (['user', 'usuario', 'u', 'fan'].includes(v)) return 'user';
  return 'user';
}

// Determina BASE_URL (dev/prod)
function resolveBaseUrl(req) {
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;

  const referer = req.headers.referer || '';
  try {
    if (referer) {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    }
  } catch (_) {}

  return process.env.NEXT_PUBLIC_BASE_URL || 'https://peek-pay.com';
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

    // userId y priceId
    const userIdRaw = (body.userId || '').toString().trim();
    const priceId = (body.priceId || '').toString().trim();

    // En producción exigimos priceId para evitar montos fallback
    if (!priceId || !priceId.startsWith('price_')) {
      return res.status(400).json({ error: 'priceId requerido (formato price_...)' });
    }

    const BASE_URL = resolveBaseUrl(req);

    const isCreator = role === 'creator';
    const productName = isCreator
      ? 'PeekPay Early Access (Creator)'
      : 'PeekPay Early Access (User)';

    // Rutas de retorno
    const successUrl = `${BASE_URL}/payment-complete.html?session_id={CHECKOUT_SESSION_ID}&t=${
      isCreator ? 'creator' : 'user'
    }&e=${encodeURIComponent(customerEmail)}`;
    const cancelUrl = `${BASE_URL}/signup.html?canceled=1&t=${isCreator ? 'creator' : 'user'}`;

    // Imagen del producto (opcional)
    const productImage = `${BASE_URL}/assets/brand/peekpay-logo-h.svg`;

    // Siempre usar el price de Stripe (evita errores de monto)
    const line_items = [{ price: priceId, quantity: 1 }];

    // Construye metadata sin contaminar con placeholders
    const metadata = {
      email: customerEmail,
      product: isCreator ? 'early_access_creator' : 'early_access_user',
      type: isCreator ? 'creator' : 'user',
      product_name: productName,
    };
    // Sólo incluye userId si es UUID válido
    if (UUID_RE.test(userIdRaw)) {
      metadata.userId = userIdRaw;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },

      // 👉 Requerido porque tu cuenta tiene custom_text.shipping_address:
      //    Stripe exige que, si usas custom_text.shipping_address, definas shipping_address_collection.
      shipping_address_collection: { allowed_countries: ['US'] }, // PR entra como US

      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,

      // Datos del "producto" (no afecta cobro al usar priceId; útil para UI de Stripe)
      custom_text: {
        shipping_address: { message: productName },
      },

      // (opcional, si quieres forzar captura de dirección/billing)
      // billing_address_collection: 'auto',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session] error:', err);
    return res.status(500).json({ error: 'Error al crear sesión de pago', message: err.message });
  }
}
