cd ~/Desktop/PeakPay

cat > api/auth-signup.js <<'JS'
import { publicClient, adminClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';

function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'')); }
function isHandle(s){ return /^[a-z0-9._]{3,30}$/.test(String(s||'')); }
function strongPass(s){
  s = String(s||'');
  return s.length>=10 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s);
}

export default async function handler(req, res){
  if (withCORS(req, res)) return;

  if (req.method !== 'POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ error:'method_not_allowed' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
  } catch { body = {}; }

  const {
    email, password, handle,
    display_name = '', country = '', role = '', news = 0
  } = body;

  // Validaciones
  if (!isEmail(email))           return res.status(400).json({ error:'invalid_email' });
  if (!isHandle(handle))         return res.status(400).json({ error:'invalid_handle' });
  if (!strongPass(password))     return res.status(400).json({ error:'weak_password' });

  try{
    const origin = process.env.SITE_ORIGIN || `https://${req.headers.host}`;
    const emailRedirectTo = `${origin}/check-email`;

    // Alta en Supabase (email + password)
    const { data, error:authError } = await publicClient.auth.signUp({
      email, password,
      options: { emailRedirectTo }
    });

    if (authError){
      // mensajes más comunes
      const msg = (authError.message||'').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')){
        return res.status(409).json({ error:'email_in_use' });
      }
      return res.status(400).json({ error:'auth_error', detail: authError.message });
    }

    const userId = data?.user?.id;

    // Crea perfil si tienes la tabla (fail-safe: no rompe si no existe)
    if (adminClient && userId){
      try{
        await adminClient
          .from('profiles')
          .insert({
            id: userId,
            handle: handle.toLowerCase(),
            display_name,
            country,
            role,
            news: news ? 1 : 0
          });
      }catch(e){
        // Si aún no existe la tabla o hay RLS, no frenamos el signup
      }
    }

    return res.status(200).json({ ok:true });
  }catch(e){
    return res.status(500).json({ error:'internal_error', detail: e?.message || String(e) });
  }
}
JS
