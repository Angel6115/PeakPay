import { adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';
import { getUserFromRequest } from './_lib/auth.mjs';

// GET /api/whoami — { is_admin } para el usuario del Bearer token. Lo usa
// platform-gate.js para saber si puede saltarse la sala de espera, sin
// tener que crear su propio cliente de Supabase en el navegador (crear uno
// aparte del que ya usa la página, con el mismo storageKey, dispara "Multiple
// GoTrueClient instances" y puede colgar/romper la sesión real de la página).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const user = await getUserFromRequest(req);
  if (!user) return res.status(200).json({ ok: true, is_admin: false });

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return res.status(200).json({ ok: true, is_admin: !!profile?.is_admin });
}
