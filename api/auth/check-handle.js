// api/auth/check-handle.js
import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '..//_lib/cors.mjs';

function isHandle(s){ return /^[a-z0-9._]{3,30}$/.test(String(s||'')); }

export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow','GET, OPTIONS');
    return res.status(405).json({ error:'method_not_allowed' });
  }

  const { handle } = req.query || {};
  const h = String(handle || '').toLowerCase().trim();

  if (!isHandle(h)) {
    return res.status(400).json({ available:false, reason:'invalid' });
  }

  // Si por alguna razón no hay service-role, “fail-open” para UX
  if (!adminClient) return res.status(200).json({ available:true });

  try {
    const { count, error } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('handle', h);

    if (error) throw error;
    return res.status(200).json({ available: (count ?? 0) === 0 });
  } catch {
    // En caso de error de DB, no bloquees al usuario
    return res.status(200).json({ available:true });
  }
}
