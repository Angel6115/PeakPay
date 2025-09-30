import { publicClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  // Maneja CORS y preflight
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Extrae Bearer token
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: 'missing_token' });

  const token = m[1];

  try {
    // Valida el token con Supabase
    const { data, error } = await publicClient.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    const u = data.user;
    return res.status(200).json({
      ok: true,
      user: {
        id: u.id,
        email: u.email,
        confirmed_at: u.email_confirmed_at || u.confirmed_at || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}
