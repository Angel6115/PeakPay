import Stripe from 'stripe';
import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// POST /api/subscriptions/cancel { subscription_id, action: 'cancel'|'resume' }
// El usuario mantiene acceso hasta el final del período ya pagado — se marca
// cancel_at_period_end en Stripe, no una cancelación inmediata. 'resume'
// deshace eso si el usuario cambia de opinión antes de que termine el ciclo.
// La cancelación efectiva (status -> 'canceled') la hace el webhook cuando
// Stripe dispara customer.subscription.deleted al llegar la fecha.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = req.body || {};
  const subscriptionId = (body.subscription_id || '').toString().trim();
  const action = (body.action || 'cancel').toString().trim();
  if (!subscriptionId) return res.status(400).json({ ok: false, error: 'subscription_id_required' });
  if (!['cancel', 'resume'].includes(action)) return res.status(400).json({ ok: false, error: 'invalid_action' });

  const { data: sub, error: subError } = await adminClient
    .from('subscriptions')
    .select('id, user_id, status, stripe_subscription_id')
    .eq('id', subscriptionId)
    .single();

  if (subError || !sub) return res.status(404).json({ ok: false, error: 'subscription_not_found' });
  if (sub.user_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (sub.status !== 'active') return res.status(409).json({ ok: false, error: 'subscription_not_active' });
  if (!sub.stripe_subscription_id) return res.status(409).json({ ok: false, error: 'missing_stripe_subscription' });

  const cancelAtPeriodEnd = action === 'cancel';

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: cancelAtPeriodEnd });
  } catch (err) {
    console.error('[subscriptions/cancel] stripe error:', err);
    return res.status(500).json({ ok: false, error: 'stripe_error', message: err.message });
  }

  const { error: updateError } = await adminClient
    .from('subscriptions')
    .update({ cancel_at_period_end: cancelAtPeriodEnd, updated_at: new Date().toISOString() })
    .eq('id', subscriptionId);

  if (updateError) return res.status(500).json({ ok: false, error: 'internal_error', detail: updateError.message });

  return res.status(200).json({ ok: true, cancel_at_period_end: cancelAtPeriodEnd });
}
