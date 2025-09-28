import { supabaseAdmin } from '../_lib/supabase.js';
import { requireEnv } from '../_lib/env.js';

const BUCKET = requireEnv('ASSET_BUCKET');

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const setId = String(u.searchParams.get('id') || '').trim();
    if (!setId) return res.status(400).json({ ok:false, error:'missing_set_id' });

    // 1) Lee el set para obtener la key
    const { data: setRow, error: setErr } = await supabaseAdmin
      .from('sets')
      .select('id, full_asset_key')
      .eq('id', setId)
      .single();

    if (setErr || !setRow) {
      return res.status(404).json({ ok:false, error:'set_not_found', detail: setErr?.message || null });
    }

    const key = setRow.full_asset_key;

    // 2) Haz stat del objeto
    const { data: stat, error: statErr } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .list(key.split('/').slice(0,-1).join('/') || '', { search: key.split('/').pop() });

    // 3) Intenta firmar 60s
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .createSignedUrl(key, 60);

    res.status(200).json({
      ok: true,
      bucket: BUCKET,
      key,
      exists: Array.isArray(stat) ? stat.some(o => o.name === key.split('/').pop()) : null,
      statErr: statErr ? { message: statErr.message, name: statErr.name } : null,
      signedUrl: signed?.signedUrl || null,
      signErr: signErr ? { message: signErr.message, name: signErr.name } : null
    });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
}
