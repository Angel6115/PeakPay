import { supabaseAdmin } from '../_lib/supabase.js';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}

const isDev = process.env.NODE_ENV !== 'production';

export default async function handler(req, res){
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try{
    const userKey = req.headers['x-pp-uid'];
    if (!userKey) return res.status(400).json({ error: 'missing_uid' });

    const { data, error } = await supabaseAdmin.rpc('grant_streak_bonus', { p_user_key: String(userKey) });

    if (error) {
      console.error('[streak-bonus] rpc error', error);
      return res.status(502).json({
        error: 'db_error',
        detail: isDev ? (error?.message || String(error)) : undefined,
        code: isDev ? (error?.code || undefined) : undefined,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error('[streak-bonus] unexpected null data');
      return res.status(500).json({ error: 'unexpected_null' });
    }

    if (row.granted) {
      return res.status(200).json({
        ok: true,
        granted: true,
        points_awarded: row.points_awarded,
        points_total: row.points_total,
        at: row.at
      });
    }

    const reason = row.reason || 'not_granted';
    const code = (reason === 'no_activity_today' || reason === 'already_granted') ? 409 : 400;
    return res.status(code).json({ ok:false, granted:false, reason, points_total: row.points_total });
  } catch(e){
    console.error('[streak-bonus] handler error', e);
    return res.status(500).json({
      error: 'internal_error',
      detail: isDev ? (e?.message || String(e)) : undefined,
    });
  }
}
