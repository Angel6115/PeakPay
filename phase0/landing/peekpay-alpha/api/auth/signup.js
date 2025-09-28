// api/auth/signup.js
import { supabaseAdmin } from '../_lib/supabase.js';
import { withCORS } from '../_lib/cors.js';

// VALIDACIONES: email, pass, handle
function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'')); }
function isStrongPass(s){
  const v = String(s||'');
  return v.length >= 10 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v);
}
function isHandle(s){ return /^[a-z0-9_\.]{3,32}$/.test(String(s||'')); }
const ALLOWED_ROLES = new Set(['usuario','creador','ambos']);

export default async function handler(req, res){
  // CORS + preflight
  if (withCORS(req, res)) return;

  try{
    if (req.method !== 'POST'){
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error:'method_not_allowed' });
    }

    const { email, password, handle, display_name, country, role } = await parseJSON(req);

    // Validaciones de entrada
    if (!isEmail(email)) return res.status(400).json({ error:'invalid_email' });
    if (!isStrongPass(password)) return res.status(400).json({ error:'weak_password' });
    if (!isHandle(handle)) return res.status(400).json({ error:'invalid_handle' });
    const roleVal = (role||'usuario').toLowerCase();
    if (!ALLOWED_ROLES.has(roleVal)) return res.status(400).json({ error:'invalid_role' });

    // 1) Verifica disponibilidad de handle
    const { data: existing, error: handleErr } = await supabaseAdmin
      .from('profiles').select('handle').eq('handle', handle).maybeSingle();
    if (handleErr) {
      console.warn('[signup] handle check error:', handleErr.message);
      // sigue pero informando fallback si algo se rompe
    }
    if (existing) return res.status(409).json({ error:'handle_taken' });

    // 2) Crea usuario en Auth (email OTP)
    const redirectTo = process.env.SIGNUP_EMAIL_REDIRECT || (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/welcome.html` : undefined);
    const { data: sign, error: signErr } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          // metadatos mínimos (no sensibles)
          role: roleVal,
          handle,
        }
      }
    });

    if (signErr) {
      const msg = signErr.message || 'auth_error';
      // colisiones típicas
      if (/already registered|User already registered/i.test(msg)) {
        return res.status(409).json({ error:'email_in_use' });
      }
      return res.status(400).json({ error:'auth_error', detail: msg });
    }

    const user = sign.user;
    if (!user) return res.status(500).json({ error:'no_user_created' });

    // 3) Crea perfil (fuera de RLS usando admin)
    const { error: profErr } = await supabaseAdmin.from('profiles').insert({
      user_id: user.id,
      handle,
      display_name: (display_name||'').slice(0,60) || null,
      country: (country||'').slice(0,60) || null,
      role: roleVal
    });
    if (profErr){
      console.error('[signup] profile insert error:', profErr.message);
      // rollback: elimina el auth user para evitar “zombis”
      try { await supabaseAdmin.auth.admin.deleteUser(user.id); } catch{}
      return res.status(500).json({ error:'profile_error' });
    }

    // 4) Respuesta: no exponemos datos sensibles
    return res.status(200).json({
      ok: true,
      next: 'check_email',
      message: 'Revisa tu correo para confirmar tu cuenta.',
    });

  }catch(e){
    console.error('[signup] unexpected:', e);
    return res.status(500).json({ error:'internal_error' });
  }
}

async function parseJSON(req){
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try{ return JSON.parse(raw||'{}'); } catch { return {}; }
}
