import { adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';
import { isLaunched } from './_lib/platform.mjs';

// GET /api/platform-status — público, sin auth. Lo consulta
// platform-gate.js en cada página para decidir si manda a la sala de
// espera. No expone nada sensible, solo un booleano.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');
  const launched = await isLaunched(adminClient);
  return res.status(200).json({ ok: true, launched });
}
