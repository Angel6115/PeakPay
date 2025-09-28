import { supabaseAdmin } from '../_lib/supabase.js';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
}

export default async function handler(req, res){
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try{
    const userKey = req.headers['x-pp-uid'];
    if (!userKey) return res.status(400).json({ error: 'missing_uid' });

    const { data, error } = await supabaseAdmin
      .rpc('get_points_status', { p_user_key: String(userKey) });

    if (error){
      console.error('[points] rpc error', error);
      return res.status(502).json({ error:'db_error' });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return res.status(200).json({ points:0, streak_days:0, claimed_today:false });

    return res.status(200).json({
      points: Number(row.points_total || 0),
      streak_days: Number(row.streak_days || 0),
      claimed_today: !!row.claimed_today
    });
  }catch(e){
    console.error('[points] handler error', e);
    return res.status(500).json({ error:'internal_error' });
  }
}
