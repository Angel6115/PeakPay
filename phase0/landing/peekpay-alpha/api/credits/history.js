// api/credits/history.js
import { supabaseAdmin } from '../_lib/supabase.js';
import { withCORS } from '../_lib/cors.js';

export default async function handler(req, res) {
  // CORS (maneja preflight)
  if (withCORS(req, res)) return;

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const userKey = req.headers['x-pp-uid'];
    if (!userKey) return res.status(400).json({ error: 'missing_uid' });

    // Parámetros
    const url = new URL(req.url, 'http://localhost');
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || 50)));

    // Leemos del libro mayor unificado (wallet_history)
    // Estructura esperada: id, user_key, type, credits, usd, points, meta, created_at
    const { data, error } = await supabaseAdmin
      .from('wallet_history')
      .select('id, type, credits, usd, points, meta, created_at')
      .eq('user_key', String(userKey))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[history] db error (devolviendo vacío):', error?.message || error);
      return res.status(200).json({ items: [], source: 'fallback' });
    }

    // Normaliza salida para el cliente
    const items = (data || []).map(r => ({
      id: r.id,
      type: r.type,            // 'topup' | 'unlock' | 'streak_bonus' | 'weekly_streak_bonus'
      credits: r.credits,      // +20 (topup), -1 (unlock), +5 (weekly), etc.
      usd: r.usd ?? 0,         // 5/10/20 en recargas; 0 en unlock/bonus
      points: r.points ?? 0,   // puntos otorgados en bonos
      meta: r.meta || null,    // info adicional (pack_usd, streak_days,…)
      ts: r.created_at
    }));

    return res.status(200).json({ items, source: 'db' });
  } catch (e) {
    console.error('[history] handler error:', e);
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(500).json({ error: 'internal_error', detail: isDev ? String(e?.message || e) : undefined });
  }
}
