import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { resolveCreatorId } from '../_lib/creators.mjs';

// Devuelve el id real de creators (creators.id) para el usuario autenticado,
// creando la fila si todavía no existe.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  try {
    const creatorId = await resolveCreatorId(adminClient, user.id);
    return res.status(200).json({ ok: true, creator_id: creatorId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }
}
