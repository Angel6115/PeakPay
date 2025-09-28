// api/auth/check-handle.js
import { supabaseAdmin } from '../_lib/supabase.js';
import { withCORS } from '../_lib/cors.js';

function isHandle(s){ return /^[a-z0-9_\.]{3,32}$/.test(String(s||'')); }

export default async function handler(req, res){
  if (withCORS(req, res)) return;
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow','GET, OPTIONS');
      return res.status(405).json({ error:'method_not_allowed' });
    }
    const url = new URL(req.url, 'http://localhost');
    const handle = (url.searchParams.get('handle')||'').toLowerCase();
    if (!isHandle(handle)) return res.status(400).json({ ok:false, valid:false, reason:'invalid' });

    const { data, error } = await supabaseAdmin
      .from('profiles').select('handle').eq('handle', handle).maybeSingle();

    if (error){
      console.warn('[check-handle] db error:', error.message);
      return res.status(200).json({ ok:true, valid:true, available:true }); // fail-open (mejor UX), el signup revalidará
    }

    return res.status(200).json({
      ok:true, valid:true, available: !data
    });
  }catch(e){
    console.error('[check-handle] unexpected:', e);
    return res.status(500).json({ error:'internal_error' });
  }
}
