// api/credits/weekly-streak-bonus.js
import { supabaseAdmin } from '../_lib/supabase.js';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}

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

    const { data, error } = await supabaseAdmin.rpc('grant_weekly_streak_reward', { p_user_key: String(userKey) });
    if (error) {
      console.error('[weekly-streak-bonus] rpc error', error);
      return res.status(502).json({ error: 'db_error' });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return res.status(500).json({ error: 'unexpected_null' });

    if (row.granted) {
      return res.status(200).json({
        ok: true,
        granted: true,
        points_awarded: row.points_awarded,
        credits_awarded: row.credits_awarded,
        streak_days: row.streak_days,
        at: row.at
      });
    } else {
      const reason = row.reason || 'not_granted';
      const code = (reason === 'already_granted' || reason === 'not_multiple_of_7') ? 409 : 400;
      return res.status(code).json({ ok:false, granted:false, reason, streak_days: row.streak_days });
    }
  } catch(e){
    console.error('[weekly-streak-bonus] handler error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
