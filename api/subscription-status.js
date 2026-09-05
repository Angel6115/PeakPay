import { adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';
import { getUserFromRequest } from './_lib/auth.mjs';

// GET /api/subscription-status?creator_handle=ink-aria
// Auth opcional: sin token, solo dice si el creador vende suscripción y a
// qué precio (info pública); con token, además dice si el usuario ya está
// suscrito.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const creatorHandle = (req.query.creator_handle || '').toString().trim();
  if (!creatorHandle) return res.status(400).json({ ok: false, error: 'creator_handle_required' });

  const { data: creator, error: creatorError } = await adminClient
    .from('creators')
    .select('id, user_id')
    .eq('handle', creatorHandle)
    .maybeSingle();

  if (creatorError || !creator || !creator.user_id) {
    return res.status(200).json({ ok: true, subscribable: false, subscribed: false, price_usd: null, creator_user_id: null });
  }

  const { data: creatorProfile } = await adminClient
    .from('profiles')
    .select('subscription_price_usd')
    .eq('id', creator.user_id)
    .single();

  const { count: subscriberCount } = await adminClient
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creator.id)
    .eq('status', 'active');

  const priceUsd = creatorProfile?.subscription_price_usd || null;
  if (!priceUsd) {
    return res.status(200).json({ ok: true, subscribable: false, subscribed: false, price_usd: null, creator_user_id: creator.user_id, subscriber_count: subscriberCount || 0 });
  }

  const user = await getUserFromRequest(req);
  let subscribed = false;
  if (user) {
    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('creator_id', creator.id)
      .eq('status', 'active')
      .maybeSingle();
    subscribed = !!sub;
  }

  return res.status(200).json({ ok: true, subscribable: true, subscribed, price_usd: priceUsd, creator_user_id: creator.user_id, subscriber_count: subscriberCount || 0 });
}
