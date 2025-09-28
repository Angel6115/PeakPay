import { supabaseAdmin } from '../_lib/supabase.js';
import { requireEnv } from '../_lib/env.js';

const BUCKET = requireEnv('ASSET_BUCKET');

// --- CORS helpers ---
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}
function isOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

// Util: parsea query (?id=...)
function getQuery(req) {
  const u = new URL(req.url, 'http://localhost');
  return Object.fromEntries(u.searchParams.entries());
}

export default async function handler(req, res) {
  try {
    if (isOptions(req, res)) return;
    setCors(res);

    // GET /api/sets/signed-full?id=<set_uuid>&ttl=3600
    if (req.method && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const q = getQuery(req);
    const setId = String(q.id || q.set_id || '').trim();
    const ttl = Math.max(60, Math.min(60 * 60 * 24, Number(q.ttl) || 3600)); // 1h por defecto

    if (!setId) return res.status(400).json({ error: 'missing_set_id' });

    // 1) Buscar set -> obtener full_asset_key
    const { data: setRow, error: setErr } = await supabaseAdmin
      .from('sets')
      .select('id, full_asset_key, cover_url, title, grid')
      .eq('id', setId)
      .single();

    if (setErr) {
      if (setErr.code === 'PGRST116') return res.status(404).json({ error: 'set_not_found' });
      console.error('[signed-full] select set error:', setErr);
      return res.status(502).json({ error: 'db_error' });
    }

    if (!setRow?.full_asset_key) {
      return res.status(404).json({ error: 'asset_key_missing' });
    }

    // 2) Firmar URL en Storage
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .createSignedUrl(setRow.full_asset_key, ttl); // segundos

    if (signErr) {
      console.error('[signed-full] sign error:', signErr);
      return res.status(502).json({ error: 'sign_error' });
    }

    return res.status(200).json({
      ok: true,
      url: signed?.signedUrl || null,
      meta: {
        id: setRow.id,
        title: setRow.title || null,
        grid: setRow.grid || 4,
        cover_url: setRow.cover_url || null,
        ttl
      }
    });
  } catch (e) {
    console.error('[signed-full] handler error:', e);
    const isDev = process.env.NODE_ENV !== 'production';
    setCors(res);
    return res.status(500).json({ error: 'internal_error', detail: isDev ? String(e?.message || e) : undefined });
  }
}
