import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { requireLaunchedOrAdmin } from '../_lib/platform.mjs';

// Manda un mensaje entre dos usuarios cualquiera (creador -> suscriptor con
// una nota/foto de agradecimiento, o suscriptor -> creador con un pedido
// especial). Misma tabla, mismo endpoint — la dirección la da from/to.
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
  const toUser = (body.to_user || '').toString().trim();
  const text = (body.body || '').toString().trim();
  const imageBase64 = (body.image_base64 || '').toString();
  const imageContentType = (body.image_content_type || 'image/jpeg').toString();

  if (!toUser) return res.status(400).json({ ok: false, error: 'to_user_required' });
  if (!text) return res.status(400).json({ ok: false, error: 'body_required' });
  if (toUser === user.id) return res.status(400).json({ ok: false, error: 'cannot_message_self' });

  const { data: recipient } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', toUser)
    .maybeSingle();
  if (!recipient) return res.status(404).json({ ok: false, error: 'recipient_not_found' });

  let imagePath = null;
  if (imageBase64) {
    imagePath = `messages/${user.id}/${Date.now()}.jpg`;
    const buffer = Buffer.from(imageBase64, 'base64');
    const { error: uploadError } = await adminClient.storage
      .from('creator-content')
      .upload(imagePath, buffer, { upsert: true, contentType: imageContentType });
    if (uploadError) {
      return res.status(500).json({ ok: false, error: 'internal_error', detail: uploadError.message });
    }
  }

  const { data, error } = await adminClient
    .from('messages')
    .insert({ from_user: user.id, to_user: toUser, body: text, image_path: imagePath })
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  return res.status(200).json({ ok: true, message: data });
}
