// api/auth/reset-request.js
import { publicClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';

function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'')); }

export default async function handler(req, res){
  if (withCORS(req, res)) return;

  if (req.method !== 'POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ error:'method_not_allowed' });
  }

  let body = {};
  try{ body = typeof req.body==='string' ? JSON.parse(req.body||'{}') : (req.body||{}); }catch{ body = {}; }
  const { email } = body;
  if (!isEmail(email)) return res.status(400).json({ error:'invalid_email' });

  try{
    const origin = process.env.SITE_ORIGIN || `https://${req.headers.host}`;
    // Si más adelante tienes una página para setear la nueva contraseña, cámbiala aquí.
    const redirectTo = origin; // p.ej. `${origin}/set-password.html`

    const { error } = await publicClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return res.status(400).json({ error:'reset_error', detail: error.message });

    return res.status(200).json({ ok:true });
  }catch(e){
    return res.status(500).json({ error:'internal_error', detail: e?.message || String(e) });
  }
}
