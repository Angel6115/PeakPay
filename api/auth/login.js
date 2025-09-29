import { publicClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';

function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'')); }

export default async function handler(req, res){
  // CORS (maneja también preflight)
  if (withCORS(req, res)) return;

  if (req.method !== 'POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ error:'method_not_allowed' });
  }

  // Parseo seguro del body
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch { body = {}; }

  const { email, password } = body;

  // Validaciones
  if (!isEmail(email))     return res.status(400).json({ error:'invalid_email' });
  if (!password || String(password).length < 1)
    return res.status(400).json({ error:'missing_password' });

  try {
    const { data, error } = await publicClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Normalizamos algunos errores comunes
      const m = (error.message || '').toLowerCase();
      if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('email or password'))
        return res.status(401).json({ error:'invalid_credentials' });

      return res.status(400).json({ error:'auth_error', detail: error.message });
    }

    // Devolvemos lo mínimo útil (evitamos exponer todo el objeto)
    const user = data?.user ? { id: data.user.id, email: data.user.email } : null;
    const session = data?.session ? {
      access_token: data.session.access_token,
      expires_at: data.session.expires_at
    } : null;

    return res.status(200).json({ ok:true, user, session });
  } catch (e) {
    return res.status(500).json({ error:'internal_error', detail: e?.message || String(e) });
  }
}
