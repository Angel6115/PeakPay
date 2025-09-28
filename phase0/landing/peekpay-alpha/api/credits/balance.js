import { supabaseAdmin } from '../_lib/supabase.js';

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

export default async function handler(req, res) {
  try {
    if (isOptions(req, res)) return;
    setCors(res);

    if (req.method && req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const userKey = req.headers['x-pp-uid'];
    if (!userKey) return res.status(400).json({ error: 'missing_uid' });

    const { data, error } = await supabaseAdmin.rpc('get_balance', {
      p_user_key: String(userKey),
    });
    if (error) throw error;

    res.status(200).json({ balance: data ?? 0 });
  } catch (e) {
    console.error('balance error', e);
    setCors(res);
    res.status(500).json({ error: 'internal_error' });
  }
}
