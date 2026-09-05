import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';

// POST /api/admin/set-launched { launched: boolean }
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireAdmin(adminClient, req);
  if (!admin) return res.status(403).json({ ok: false, error: 'forbidden' });

  const launched = req.body?.launched === true;

  const { error } = await adminClient
    .from('app_config')
    .upsert({ key: 'launched', value: launched }, { onConflict: 'key' });
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  return res.status(200).json({ ok: true, launched });
}
