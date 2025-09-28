import { supabaseAdmin } from '../_lib/supabase.js';

// --- CORS helpers (para llamadas desde http://localhost:5173) ---
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const uid = req.headers['x-pp-uid'];
    if (!uid) return res.status(400).json({ error: 'missing_uid' });

    let body = {};
    try { body = req.body || JSON.parse(req.body || '{}'); } catch {}
    const pack = Number(body.pack);

    // Mapa de packs que definiste
    const PACKS = {
      5:  { usd: 5,  credits: 20 },
      10: { usd: 10, credits: 50 },
      20: { usd: 20, credits: 120 },
    };
    const sel = PACKS[pack];
    if (!sel) return res.status(400).json({ error: 'invalid_pack' });

    // 1) Actualiza balance de forma atómica (RPC creado en Paso 7)
    const { data: newBalance, error: rpcErr } = await supabaseAdmin.rpc('add_credits', {
      p_user_key: String(uid),
      p_amount: sel.credits,
    });
    if (rpcErr) {
      console.error('[topup] add_credits error', rpcErr);
      return res.status(502).json({ error: 'wallet_update_failed' });
    }

    // 2) Inserta en el historial (wallet_log)
    const meta = { source: 'wallet', pack_usd: sel.usd, credits: sel.credits };
    const { error: insErr } = await supabaseAdmin
      .from('wallet_log')
      .insert({
        user_key: String(uid),
        kind: 'topup',
        credits: sel.credits,
        usd: sel.usd,
        meta,
      });
    if (insErr) {
      // No rompemos la recarga si falló el log, pero lo registramos
      console.warn('[topup] log insert warn', insErr);
    }

    // 3) Puntos (simple): 1 punto por cada $1 recargado
    const pointsAdded = sel.usd;

    return res.status(200).json({
      ok: true,
      added: sel.credits,
      usd: sel.usd,
      points: pointsAdded,
      balance: newBalance ?? null,
    });
  } catch (e) {
    console.error('[topup] handler error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
