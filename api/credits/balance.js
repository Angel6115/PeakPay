import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';

export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const { data, error } = await adminClient
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });
  }

  const credits = data?.credits || 0;

  // NOTA: profiles no tiene columna `points` todavía; se reporta 0 (mismo
  // placeholder que ya usa profile.html) hasta que se implemente en la DB.
  return res.status(200).json({ ok: true, credits, points: 0, balance: credits });
}
