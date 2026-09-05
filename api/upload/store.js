import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { requireLaunchedOrAdmin } from '../_lib/platform.mjs';

// Sube un archivo al bucket `creator-content` con el admin client. El cliente
// (anon key) choca con la política RLS del bucket, así que esto se hace acá,
// server-side, igual que el resto de escrituras sensibles del sistema.
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  if (!(await requireLaunchedOrAdmin(adminClient, user))) {
    return res.status(423).json({ ok: false, error: 'platform_not_launched' });
  }

  const body = req.body || {};
  const path = (body.path || '').toString().trim();
  const contentBase64 = (body.content_base64 || '').toString();
  const contentType = (body.content_type || 'application/octet-stream').toString();

  if (!path || !contentBase64) {
    return res.status(400).json({ ok: false, error: 'path_and_content_required' });
  }

  // El path debe vivir bajo el handle del propio usuario (evita que alguien
  // pueda sobrescribir archivos de otro creador pasando un path arbitrario).
  const { data: profile } = await adminClient
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .single();
  const handle = profile?.handle || `creator-${user.id.slice(0, 8)}`;

  if (!path.startsWith(`photos/${handle}/`)) {
    return res.status(403).json({ ok: false, error: 'path_not_allowed' });
  }

  const buffer = Buffer.from(contentBase64, 'base64');

  const { error: uploadError } = await adminClient.storage
    .from('creator-content')
    .upload(path, buffer, { upsert: true, contentType });

  if (uploadError) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: uploadError.message });
  }

  const { data: pub } = adminClient.storage.from('creator-content').getPublicUrl(path);

  return res.status(200).json({ ok: true, path, public_url: pub?.publicUrl || null });
}
