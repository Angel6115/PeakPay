import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  const { handle } = req.query || {};
  const h = String(handle || '').toLowerCase().trim();

  if (!/^[a-z0-9._]{3,30}$/.test(h)) {
    return res.status(400).json({ available: false, reason: 'invalid' });
  }

  // Si aún no hay tabla o no queremos consultar, devolvemos disponible=true
  if (!adminClient) return res.status(200).json({ available: true });

  try {
    // Cuando tengas tabla "profiles" con columna "handle", descomenta:
    // const { data, error } = await adminClient
    //   .from('profiles')
    //   .select('id', { count: 'exact', head: true })
    //   .eq('handle', h);
    // if (error) throw error;
    // const available = (data?.length ?? 0) === 0;
    // return res.status(200).json({ available });

    // Placeholder por ahora:
    return res.status(200).json({ available: true });
  } catch (e) {
    return res.status(200).json({ available: true });
  }
}
