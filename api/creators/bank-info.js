import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';

const REQUIRED_FIELDS = ['account_name', 'bank', 'account_number', 'account_type', 'payment_email'];

// GET  /api/creators/bank-info — datos bancarios + resumen de pagos del
//      creador autenticado (solo los suyos).
// POST /api/creators/bank-info — guarda/actualiza sus propios datos.
//
// Antes esto se escribía directo desde el navegador a profiles.bank_info
// con el cliente anon — sin validar campos y sin que nada más en el
// sistema lo leyera. Ahora pasa por acá (server-side, admin client) igual
// que el resto de escrituras sensibles, y alimenta el panel de admin de
// payouts (api/admin/payouts.js).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  if (req.method === 'GET') {
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('bank_info, creator_earnings')
      .eq('id', user.id)
      .single();
    if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

    const { data: payouts, error: payoutsError } = await adminClient
      .from('payouts')
      .select('id, amount_usd, method, note, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });
    if (payoutsError) return res.status(500).json({ ok: false, error: 'internal_error', detail: payoutsError.message });

    const earned = Number(profile?.creator_earnings) || 0;
    const paid = (payouts || []).reduce((sum, p) => sum + Number(p.amount_usd), 0);
    const pending = Math.round((earned - paid) * 100) / 100;

    return res.status(200).json({
      ok: true,
      bank_info: profile?.bank_info || null,
      earned_usd: earned,
      paid_usd: Math.round(paid * 100) / 100,
      pending_usd: pending,
      payouts: payouts || [],
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const bankInfo = {};
    for (const field of REQUIRED_FIELDS) {
      const value = (body[field] || '').toString().trim();
      if (!value) return res.status(400).json({ ok: false, error: `${field}_required` });
      bankInfo[field] = value;
    }

    const { error } = await adminClient
      .from('profiles')
      .update({ bank_info: bankInfo })
      .eq('id', user.id);
    if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

    return res.status(200).json({ ok: true, bank_info: bankInfo });
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
