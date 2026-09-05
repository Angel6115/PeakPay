import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';

// POST /api/admin/mark-paid { creator_id, amount_usd, method, note }
// Registra un pago que el admin YA hizo manualmente (transferencia,
// Wise, etc.) — este endpoint no mueve dinero, solo lo anota para que
// pending_usd baje y quede un historial auditable. No permite anotar más
// de lo que el creador tiene pendiente (evita duplicar/pagar de más por
// error de tipeo).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireAdmin(adminClient, req);
  if (!admin) return res.status(403).json({ ok: false, error: 'forbidden' });

  const body = req.body || {};
  const creatorId = (body.creator_id || '').toString().trim();
  const amountUsd = Number(body.amount_usd);
  const method = (body.method || '').toString().trim() || null;
  const note = (body.note || '').toString().trim() || null;

  if (!creatorId) return res.status(400).json({ ok: false, error: 'creator_id_required' });
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ ok: false, error: 'invalid_amount' });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('creator_earnings')
    .eq('id', creatorId)
    .single();
  if (profileError || !profile) return res.status(404).json({ ok: false, error: 'creator_not_found' });

  const { data: existingPayouts, error: payoutsError } = await adminClient
    .from('payouts')
    .select('amount_usd')
    .eq('creator_id', creatorId);
  if (payoutsError) return res.status(500).json({ ok: false, error: 'internal_error', detail: payoutsError.message });

  const alreadyPaid = (existingPayouts || []).reduce((sum, p) => sum + Number(p.amount_usd), 0);
  const pending = Number(profile.creator_earnings) - alreadyPaid;

  if (amountUsd > pending + 0.01) {
    return res.status(400).json({ ok: false, error: 'amount_exceeds_pending', pending_usd: Math.round(pending * 100) / 100 });
  }

  const { data: payout, error } = await adminClient
    .from('payouts')
    .insert({ creator_id: creatorId, amount_usd: amountUsd, method, note, paid_by: admin.id })
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  return res.status(200).json({ ok: true, payout });
}
