import { publicClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  // CORS (maneja preflight)
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Aceptamos Authorization: Bearer <jwt> o X-PP-Token
  const auth = req.headers.authorization || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const token = bearer || req.headers['x-pp-token'];

  if (!token) return res.status(401).json({ ok:false, error: 'missing_token' });

  try {
    const { data, error } = await publicClient.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ ok:false, error: 'invalid_token' });

    // devolvemos lo mínimo
    const user = { id: data.user.id, email: data.user.email };
    return res.status(200).json({ ok:true, user });
  } catch (e) {
    return res.status(500).json({ ok:false, error:'internal_error', detail: e?.message || String(e) });
  }
}
