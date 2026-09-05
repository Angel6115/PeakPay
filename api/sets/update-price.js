import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { resolveCreatorId } from '../_lib/creators.mjs';
import { requireLaunchedOrAdmin } from '../_lib/platform.mjs';

// Actualiza el precio por unlock de un set. Server-side a propósito: el
// UPDATE directo del cliente contra `sets` no tira error bajo RLS, pero
// tampoco toca ninguna fila — un falso positivo silencioso (el creador ve
// "guardado" y el precio nunca cambia).
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
  const price = Number(body.price);

  if (!setId) return res.status(400).json({ ok: false, error: 'set_id_required' });
  if (!price || price < 1) return res.status(400).json({ ok: false, error: 'invalid_price' });

  let creatorId;
  try {
    creatorId = await resolveCreatorId(adminClient, user.id);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }

  // Confirma dueño antes de tocar nada (nadie debe poder cambiar el precio
  // del set de otro creador pasando su id).
  const { data: set, error: readError } = await adminClient
    .from('sets')
    .select('id, creator_id')
    .eq('id', setId)
    .single();

  if (readError || !set) return res.status(404).json({ ok: false, error: 'set_not_found' });
  if (set.creator_id !== creatorId) return res.status(403).json({ ok: false, error: 'not_your_set' });

  const { error: updateError } = await adminClient
    .from('sets')
    .update({ price })
    .eq('id', setId);

  if (updateError) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: updateError.message });
  }

  return res.status(200).json({ ok: true, set_id: setId, price });
}
