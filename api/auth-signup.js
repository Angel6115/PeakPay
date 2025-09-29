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
    return res.status(405).json({ ok:false, error:'method_not_allowed' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
  } catch {
    console.warn('[signup] JSON body parse failed');
    return res.status(400).json({ ok:false, error:'invalid_json' });
  }

  const {
    email, password, handle,
    display_name = '', country = '', role = '', news = 0
  } = body || {};

  // Validaciones
  if (!isEmail(email))       return res.status(400).json({ ok:false, error:'invalid_email' });
  if (!isHandle(handle))     return res.status(400).json({ ok:false, error:'invalid_handle' });
  if (!strongPass(password)) return res.status(400).json({ ok:false, error:'weak_password' });

  try{
    const origin = process.env.SITE_ORIGIN || `https://${req.headers.host}`;
    const emailRedirectTo = `${origin}/check-email`;

    console.log('[signup] attempting', { email, handle, emailRedirectTo });

    // Registro en Supabase
    const { data, error:authError } = await publicClient.auth.signUp({
      email, password,
      options: { emailRedirectTo }
    });

    if (authError){
      const msg = (authError.message || '').toLowerCase();
      console.warn('[signup] supabase auth error:', authError.message);
      if (msg.includes('already registered') || msg.includes('already exists')){
        return res.status(409).json({ ok:false, error:'email_in_use', detail: authError.message });
      }
      return res.status(400).json({ ok:false, error:'auth_error', detail: authError.message });
    }

    const userId = data?.user?.id;

    // Perfil (si existe tabla/permite)
    if (adminClient && userId){
      try{
        const { error:profileErr } = await adminClient
          .from('profiles')
          .insert({
            id: userId,
            handle: String(handle).toLowerCase(),
            display_name,
            country,
            role,
            news: news ? 1 : 0
          });

        if (profileErr){
          console.warn('[signup] profile insert error (non-blocking):', profileErr.message);
        }
      }catch(e){
        console.warn('[signup] profile insert exception (non-blocking):', e?.message || String(e));
      }
    }

    return res.status(200).json({ ok:true });
  }catch(e){
    console.error('[signup] unexpected:', e?.message || String(e));
    return res.status(500).json({ ok:false, error:'internal_error', detail: e?.message || String(e) });
  }
}