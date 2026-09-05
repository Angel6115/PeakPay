import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { resolveCreatorId } from '../_lib/creators.mjs';

// Lista los suscriptores del creador autenticado, con el total real que
// cada uno le ha aportado (suma de sus ganancias marcadas con ese
// subscriber_id/buyer_id en wallet_txns — ver api/_lib/earnings.mjs).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let creatorId;
  try {
    creatorId = await resolveCreatorId(adminClient, user.id);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }

  const { data: subs, error: subsError } = await adminClient
    .from('subscriptions')
    .select('id, user_id, status, price_usd, created_at, current_period_end')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });

  if (subsError) return res.status(500).json({ ok: false, error: 'internal_error', detail: subsError.message });

  const subscriberIds = [...new Set((subs || []).map(s => s.user_id))];
  let peopleById = {};
  if (subscriberIds.length) {
    const { data: people } = await adminClient
      .from('profiles')
      .select('id, handle, email, display_name')
      .in('id', subscriberIds);
    peopleById = Object.fromEntries((people || []).map(p => [p.id, p]));
  }

  // Todas las ganancias de este creador, agrupadas por quién pagó
  // (subscriber_id para suscripciones, buyer_id para unlocks sueltos).
  const { data: earnings } = await adminClient
    .from('wallet_txns')
    .select('usd_delta, meta')
    .eq('user_key', user.id)
    .eq('type', 'earning');

  const contributedByPerson = {};
  for (const e of earnings || []) {
    const personId = e.meta?.subscriber_id || e.meta?.buyer_id;
    if (!personId) continue;
    contributedByPerson[personId] = (contributedByPerson[personId] || 0) + Number(e.usd_delta || 0);
  }

  const subscribers = (subs || []).map(s => ({
    ...s,
    person: peopleById[s.user_id] || null,
    contributed: Math.round((contributedByPerson[s.user_id] || 0) * 100) / 100,
  }));

  return res.status(200).json({ ok: true, subscribers });
}
