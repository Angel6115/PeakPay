// api/credits/level.js
import { supabaseAdmin } from '../_lib/supabase.js';

function getUID(req) {
  return String(req.headers['x-pp-uid'] || '').trim();
}

// Define los thresholds de nivel (puedes mover a DB más adelante)
const TIERS = [
  { level: 1, min: 0,   reward: null },
  { level: 2, min: 50,  reward: null },
  { level: 3, min: 150, reward: null },
  { level: 4, min: 400, reward: null },
  { level: 5, min: 900, reward: null },
];

function computeLevel(points) {
  let current = TIERS[0];
  for (const t of TIERS) if (points >= t.min) current = t;

  const idx = TIERS.findIndex(t => t.level === current.level);
  const next = TIERS[idx + 1] || null;

  const prevMin = current.min;
  const nextMin = next ? next.min : prevMin;
  const span = Math.max(1, nextMin - prevMin);
  const progress = Math.max(0, Math.min(1, (points - prevMin) / span));

  return {
    level: current.level,
    current_min: prevMin,
    next_min: next ? next.min : null,
    percent: Math.round(progress * 100),
    remaining: next ? Math.max(0, next.min - points) : 0,
    next_level: next ? next.level : null,
  };
}

export default async function handler(req, res) {
  // CORS (simple)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const uid = getUID(req);
    if (!uid) return res.status(400).json({ error: 'missing_uid' });

    const { data, error } = await supabaseAdmin
      .from('user_wallet')
      .select('points')
      .eq('user_key', uid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[level] db error:', error);
      return res.status(502).json({ error: 'db_error' });
    }

    const pts = Number(data?.points || 0);
    const lvl = computeLevel(pts);

    return res.status(200).json({
      points: pts,
      ...lvl,
      tiers: TIERS, // opcional para UI
    });
  } catch (e) {
    console.error('[level] handler error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
