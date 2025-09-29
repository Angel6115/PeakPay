import { adminClient } from '../_lib/supabase.mjs';

export default async function handler(req, res) {
  const { handle } = req.query || {};
  const h = String(handle || '').toLowerCase().trim();

  // validación básica
  if (!/^[a-z0-9._]{3,30}$/.test(h)) {
    return res.status(400).json({ available: false, reason: 'invalid' });
  }

  // Si no hay adminClient o aún no hay tabla, responde disponible=true
  if (!adminClient) return res.status(200).json({ available: true });

  try {
    // Descomenta cuando tengas tabla "profiles" con columna "handle"
    // const { data, error } = await adminClient
    //   .from('profiles')
    //   .select('id', { count: 'exact', head: true })
    //   .eq('handle', h);
    // if (error) throw error;
    // const available = (data?.length ?? 0) === 0;
    // return res.status(200).json({ available });

    // Placeholder mientras no exista la tabla:
    return res.status(200).json({ available: true });
  } catch (e) {
    return res.status(200).json({ available: true });
  }
}
