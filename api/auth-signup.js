// api/auth-signup.js
import { publicClient, adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';

const isEmail  = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const isHandle = (s) => /^[a-z0-9._]{3,30}$/.test(String(s || ''));
const strongPass = (s) => {
  s = String(s || '');
  return s.length >= 10 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s);
};

export default async function handler(req, res) {
  // Resuelve preflight y fija cabeceras CORS
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Intenta parsear el cuerpo como JSON; si ya viene objeto, úsalo.
  let body = {};
  try {
    body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});
  } catch {
    body = {};
  }

  // Normalización
  const emailRaw   = (body.email || '').trim();
  const password   = String(body.password || '');
  const handleRaw  = (body.handle || '').trim();
  const displayRaw = (body.display_name || '').trim();
  const countryRaw = (body.country || '').trim();
  const roleRaw    = (body.role || '').trim();
  const news       = body.news ? 1 : 0;

  const email  = emailRaw.toLowerCase();
  const handle = handleRaw.toLowerCase();

  // Validaciones
  if (!isEmail(email))       return res.status(400).json({ error: 'invalid_email' });
  if (!isHandle(handle))     return res.status(400).json({ error: 'invalid_handle' });
  if (!strongPass(password)) return res.status(400).json({ error: 'weak_password' });

  try {
    // URL de retorno para la confirmación por correo
    const origin =
      process.env.SITE_ORIGIN ||
      (req.headers?.host ? `https://${req.headers.host}` : '');
    const emailRedirectTo = `${origin}/check-email`;

    // Alta en Supabase Auth (email + password)
    const { data, error: authError } = await publicClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo }
    });

    if (authError) {
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return res.status(409).json({ error: 'email_in_use' });
      }
      return res.status(400).json({ error: 'auth_error', detail: authError.message });
    }

    const userId = data?.user?.id;

    // Crea perfil (soft-fail si no hay tabla o políticas todavía)
    if (adminClient && userId) {
      try {
        await adminClient
          .from('profiles')
          .insert({
            id: userId,
            handle,
            display_name: displayRaw,
            country: countryRaw,
            role: roleRaw,
            news
          });
      } catch {
        // No bloquea el signup si la tabla/políticas aún no están listas
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}
