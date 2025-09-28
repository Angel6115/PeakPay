// api/unlock.js
import { supabaseAdmin } from './_lib/supabase.js';

// CORS helper
function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}

function getQ(req) {
  const u = new URL(req.url, 'http://localhost');
  return Object.fromEntries(u.searchParams.entries());
}

export default async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const uid = String(req.headers['x-pp-uid'] || '').trim();
    if (!uid) return res.status(400).json({ error: 'missing_uid' });

    // Params
    const q = getQ(req);
    const setId = String(q.set_id || q.sid || '').trim();
    const count = Math.max(1, Math.min(9, Number(q.count) || 1)); // 1..9
    const pack  = Math.max(1, Math.min(9, Number(q.pack)  || count));
    const mode  = (q.mode || 'tap').slice(0,24);
    const idem  = (q.idem || '').slice(0,64);

    if (!setId) return res.status(400).json({ error: 'missing_set_id' });

    // 1) Cargar balance actual
    const { data: wal, error: wErr } = await supabaseAdmin
      .from('user_wallet')
      .select('user_key,balance')
      .eq('user_key', uid)
      .single();

    if (wErr && wErr.code !== 'PGRST116') {
      console.error('unlock select wallet error:', wErr);
      return res.status(502).json({ error: 'db_wallet' });
    }

    const current = wal?.balance ?? 0;
    if (current < count) {
      return res.status(402).json({ error: 'insufficient_credits', need: count, have: current });
    }

    // 2) Cobrar
    const newBalance = current - count;

    // upsert wallet
    {
      const { error } = await supabaseAdmin
        .from('user_wallet')
        .upsert({ user_key: uid, balance: newBalance }, { onConflict: 'user_key' });
      if (error) {
        console.error('unlock upsert wallet error:', error);
        return res.status(502).json({ error: 'wallet_update' });
      }
    }

    // 3) Registrar evento en historial (créditos negativos) y sumar puntos
    // Regla: +1 punto por cada crédito cobrado (count)
    const pointsEarned = count;

    // Insert evento principal (unlock)
    {
      const payload = {
        user_key: uid,
        type: 'unlock',
        credits: -count,
        usd: null,
        points: pointsEarned,
        meta: {
          set_id: setId,
          pack,
          mode,
          idem
        }
      };
      const { error } = await supabaseAdmin.from('credit_events').insert(payload);
      if (error) {
        console.error('unlock insert event error:', error);
        // no revertimos el cobro para simplificar el MVP
      }
    }

    // 4) (Opcional) registrar progreso revelado a nivel set (si tienes tabla)
    // En este MVP solo devolvemos un contador "revealed" simulado
    let revealedCount = null;
    {
      const { data, error } = await supabaseAdmin.rpc('get_revealed_count', {
        p_user_key: uid, p_set_id: setId
      });
      if (!error && typeof data === 'number') revealedCount = data + count;
    }

    // 5) Responder con balance y puntos
    return res.status(200).json({
      ok: true,
      balance: newBalance,
      revealed: revealedCount,
      charged: count,
      pack,
      mode,
      idem,
      points_earned: pointsEarned
    });

  } catch (e) {
    console.error('unlock handler error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
