// ⚠️ Migrar a un procesador de alto riesgo antes de aceptar el primer pago
// real — ver la nota completa en api/stripe-webhook.js.
import Stripe from 'stripe';
import { withCORS } from './_lib/cors.mjs';
import { getUserFromRequest } from './_lib/auth.mjs';
import { adminClient } from './_lib/supabase.mjs';
import { requireLaunchedOrAdmin } from './_lib/platform.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const PACKS = {
  '100': { credits: 100, usd: 0.99 },
  '500': { credits: 500, usd: 4.49 },
  '1000': { credits: 1000, usd: 7.99 },
};

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
  return process.env.SITE_ORIGIN || 'https://peak-pay.vercel.app';
}

export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  if (!(await requireLaunchedOrAdmin(adminClient, user))) {
    return res.status(423).json({ ok: false, error: 'platform_not_launched' });
  }

  const pack = (req.body?.pack || '').toString().trim();
  const packDef = PACKS[pack];
  if (!packDef) return res.status(400).json({ ok: false, error: 'invalid_pack' });

  const BASE_URL = resolveBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${packDef.credits} Peak Credits — PeekPay` },
          unit_amount: Math.round(packDef.usd * 100),
        },
        quantity: 1,
      }],
      success_url: `${BASE_URL}/wallet.html?topup=success`,
      cancel_url: `${BASE_URL}/wallet.html?topup=canceled`,
      metadata: {
        type: 'credit_topup',
        user_id: user.id,
        credits: String(packDef.credits),
        usd: String(packDef.usd),
      },
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error('[create-topup-session] error:', err);
    return res.status(500).json({ ok: false, error: 'stripe_error', message: err.message });
  }
}
