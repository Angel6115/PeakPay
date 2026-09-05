import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';

// GET /api/admin/applications — creadoras con status='pending', listas para
// revisar con sus 2 fotos de muestra y categoría antes de que sean visibles
// públicamente en la plataforma.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireAdmin(adminClient, req);
  if (!admin) return res.status(403).json({ ok: false, error: 'forbidden' });

  const { data: creators, error } = await adminClient
    .from('creators')
    .select('id, user_id, handle, name, display_name, main_category, sample_photo_1, sample_photo_2, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  const userIds = [...new Set((creators || []).map(c => c.user_id).filter(Boolean))];
  let emailById = {};
  if (userIds.length) {
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    emailById = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));
  }

  const result = (creators || []).map(c => ({
    ...c,
    email: emailById[c.user_id] || null,
  }));

  return res.status(200).json({ ok: true, applications: result });
}
