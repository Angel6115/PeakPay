import { adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';
import { getUserFromRequest } from './_lib/auth.mjs';
import { creditCreatorEarnings } from './_lib/earnings.mjs';
import { requireLaunchedOrAdmin } from './_lib/platform.mjs';

const USD_PER_CREDIT = 0.25;
const CREATOR_SHARE = 0.85;

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
  const setId = (body.set_id || '').toString().trim();
  const count = Math.max(1, Math.floor(Number(body.count || 1)));

  if (!setId) return res.status(400).json({ ok: false, error: 'set_id_required' });

  // Si el set pertenece a un creador y el usuario tiene una suscripción
  // activa a ese creador, el desbloqueo es gratis (no toca créditos) —
  // el mismo mosaico completo ya está incluido en la suscripción.
  const { data: set } = await adminClient
    .from('sets')
    .select('creator_id')
    .eq('id', setId)
    .maybeSingle();

  if (set?.creator_id) {
    const { data: activeSub } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('creator_id', set.creator_id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeSub) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

      return res.status(200).json({
        ok: true,
        unlocked: count,
        set_id: setId,
        via_subscription: true,
        credits: profile?.credits || 0,
        points: 0,
        balance: profile?.credits || 0,
      });
    }
  }

  // NOTA: read-then-write no atómico. Leemos profiles.credits y luego hacemos
  // un update aparte; bajo tráfico concurrente real, dos requests del mismo
  // usuario podrían leer el mismo saldo antes de que el primer update se
  // refleje, permitiendo descontar más créditos de los que realmente tiene.
  // Migrar a una función RPC de Postgres (UPDATE ... SET credits = credits -
  // count WHERE id = ... AND credits >= count RETURNING credits) en cuanto
  // haya tráfico real, para que el chequeo y el descuento sean atómicos.
  const { data: profile, error: readError } = await adminClient
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (readError) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: readError.message });
  }

  const currentCredits = profile?.credits || 0;
  if (currentCredits < count) {
    return res.status(402).json({ ok: false, error: 'insufficient_credits' });
  }

  const newCredits = currentCredits - count;

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ credits: newCredits })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: updateError.message });
  }

  if (set?.creator_id) {
    const usdSpent = count * USD_PER_CREDIT;
    const creatorCut = Math.round(usdSpent * CREATOR_SHARE * 100) / 100;
    await creditCreatorEarnings(adminClient, set.creator_id, creatorCut, {
      source: 'unlock',
      set_id: setId,
      buyer_id: user.id,
      credits: count,
    });
  }

  return res.status(200).json({
    ok: true,
    unlocked: count,
    set_id: setId,
    credits: newCredits,
    points: 0,
    balance: newCredits,
  });
}
