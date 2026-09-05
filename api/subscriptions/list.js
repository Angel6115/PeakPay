import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';

// GET /api/subscriptions/list — suscripciones del usuario autenticado
// (activas y pasadas), con los datos del creador para mostrarlas.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  res.setHeader('Cache-Control', 'no-store');

  const { data: subs, error: subsError } = await adminClient
    .from('subscriptions')
    .select('id, creator_id, status, price_usd, current_period_end, cancel_at_period_end, canceled_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (subsError) return res.status(500).json({ ok: false, error: 'internal_error', detail: subsError.message });

  const creatorIds = [...new Set((subs || []).map(s => s.creator_id))];
  let creatorsById = {};
  if (creatorIds.length) {
    const { data: creators } = await adminClient
      .from('creators')
      .select('id, handle, name, display_name, avatar_url')
      .in('id', creatorIds);
    creatorsById = Object.fromEntries((creators || []).map(c => [c.id, c]));
  }

  const result = (subs || []).map(s => {
    const c = creatorsById[s.creator_id] || {};
    return {
      id: s.id,
      status: s.status,
      price_usd: s.price_usd,
      current_period_end: s.current_period_end,
      cancel_at_period_end: !!s.cancel_at_period_end,
      canceled_at: s.canceled_at,
      created_at: s.created_at,
      creator: {
        handle: c.handle || null,
        name: c.display_name || c.name || c.handle || 'Creador',
        avatar_url: c.avatar_url || null,
      },
    };
  });

  return res.status(200).json({ ok: true, subscriptions: result });
}
