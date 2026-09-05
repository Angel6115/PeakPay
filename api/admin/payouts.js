import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';

// GET /api/admin/payouts — para cada creador con ganancias > 0: cuánto ha
// ganado, cuánto se le ha pagado ya, cuánto le queda pendiente, y sus datos
// bancarios completos (acá sí sin enmascarar — quien pide esto es el admin
// que necesita hacer la transferencia real).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireAdmin(adminClient, req);
  if (!admin) return res.status(403).json({ ok: false, error: 'forbidden' });

  const { data: creators, error } = await adminClient
    .from('profiles')
    .select('id, handle, display_name, name, email, bank_info, creator_earnings')
    .eq('is_creator', true)
    .gt('creator_earnings', 0)
    .order('creator_earnings', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  const { data: allPayouts, error: payoutsError } = await adminClient
    .from('payouts')
    .select('creator_id, amount_usd');
  if (payoutsError) return res.status(500).json({ ok: false, error: 'internal_error', detail: payoutsError.message });

  const paidByCreator = {};
  for (const p of allPayouts || []) {
    paidByCreator[p.creator_id] = (paidByCreator[p.creator_id] || 0) + Number(p.amount_usd);
  }

  const result = (creators || []).map(c => {
    const earned = Number(c.creator_earnings) || 0;
    const paid = paidByCreator[c.id] || 0;
    return {
      id: c.id,
      handle: c.handle,
      name: c.display_name || c.name || c.handle,
      email: c.email,
      bank_info: c.bank_info || null,
      earned_usd: earned,
      paid_usd: Math.round(paid * 100) / 100,
      pending_usd: Math.round((earned - paid) * 100) / 100,
    };
  });

  return res.status(200).json({ ok: true, creators: result });
}
