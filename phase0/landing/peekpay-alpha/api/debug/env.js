import { requireEnv } from '../_lib/env.js';
import { supabaseAdmin } from '../_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const url = requireEnv('SUPABASE_URL');
    const key = requireEnv('SUPABASE_SERVICE_ROLE');

    const redact = (v) => (v ? String(v).slice(0, 8) + '…' : null);
    let urlHost = null;
    try { urlHost = new URL(url).host; } catch {}

    // Llamada de prueba (no muta)
    const { data, error } = await supabaseAdmin.rpc('get_balance', { p_user_key: 'test-user-123' });

    res.status(200).json({
      ok: true,
      env: { hasUrl: !!url, urlHost, keyStartsWith: redact(key) },
      rpc: {
        data,
        error: error ? { message: error.message, details: error.details || null, hint: error.hint || null, code: error.code || null } : null
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
