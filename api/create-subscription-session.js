// ⚠️ Migrar a un procesador de alto riesgo antes de aceptar el primer pago
// real — ver la nota completa en api/stripe-webhook.js.
import Stripe from 'stripe';
import { adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';
import { getUserFromRequest } from './_lib/auth.mjs';
import { requireLaunchedOrAdmin } from './_lib/platform.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

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

  const body = req.body || {};
  const creatorHandle = (body.creator_handle || '').toString().trim();
  if (!creatorHandle) return res.status(400).json({ ok: false, error: 'creator_handle_required' });

  const { data: creator, error: creatorError } = await adminClient
    .from('creators')
    .select('id, user_id, handle, name')
    .eq('handle', creatorHandle)
    .single();

  if (creatorError || !creator) {
    return res.status(404).json({ ok: false, error: 'creator_not_found' });
  }

  if (!creator.user_id) {
    return res.status(409).json({ ok: false, error: 'creator_not_subscribable' });
  }

  if (creator.user_id === user.id) {
    return res.status(400).json({ ok: false, error: 'cannot_subscribe_to_self' });
  }

  const { data: creatorProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('subscription_price_usd')
    .eq('id', creator.user_id)
    .single();

  if (profileError || !creatorProfile?.subscription_price_usd) {
    return res.status(409).json({ ok: false, error: 'price_not_set' });
  }

  const { data: existingSub } = await adminClient
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('creator_id', creator.id)
    .eq('status', 'active')
    .maybeSingle();

  if (existingSub) {
    return res.status(409).json({ ok: false, error: 'already_subscribed' });
  }

  const priceUsd = Number(creatorProfile.subscription_price_usd);
  const BASE_URL = resolveBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Suscripción a ${creator.name || creator.handle} — PeekPay` },
          unit_amount: Math.round(priceUsd * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${BASE_URL}/peek.html?creator=${encodeURIComponent(creator.handle)}&sub=success`,
      cancel_url: `${BASE_URL}/peek.html?creator=${encodeURIComponent(creator.handle)}&sub=canceled`,
      metadata: {
        type: 'creator_subscription',
        user_id: user.id,
        creator_id: creator.id,
        price_usd: String(priceUsd),
      },
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    console.error('[create-subscription-session] error:', err);
    return res.status(500).json({ ok: false, error: 'stripe_error', message: err.message });
  }
}
