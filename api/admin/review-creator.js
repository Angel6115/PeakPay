import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';
import { notifyCreatorReviewResult } from '../_lib/email.mjs';

// POST /api/admin/review-creator { creator_id, action: 'approve'|'reject', reason? }
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
  const action = (body.action || '').toString().trim();
  const reason = (body.reason || '').toString().trim() || null;

  if (!creatorId) return res.status(400).json({ ok: false, error: 'creator_id_required' });
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ ok: false, error: 'invalid_action' });

  const update = {
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: admin.id,
    rejection_reason: action === 'reject' ? reason : null,
  };

  const { data, error } = await adminClient
    .from('creators')
    .update(update)
    .eq('id', creatorId)
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  // No debe tumbar la respuesta si el email falla — la revisión ya quedó
  // guardada de todas formas.
  await notifyCreatorReviewResult(adminClient, creatorId, action === 'approve', reason)
    .catch(err => console.warn('[review-creator] no se pudo notificar a la creadora:', err.message));

  return res.status(200).json({ ok: true, creator: data });
}
