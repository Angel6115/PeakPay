import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { notifyAdminsNewApplication } from '../_lib/email.mjs';

// POST /api/creators/submit-application
// { photo1_base64, photo1_content_type, photo2_base64, photo2_content_type }
//
// Sube las 2 fotos de muestra que un creador manda al registrarse y las
// guarda en creators.sample_photo_1/2 para que el admin las revise en
// /admin.html antes de que la cuenta quede visible públicamente
// (creators.status arranca en 'pending' por DEFAULT en la tabla).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = req.body || {};
  const photo1 = (body.photo1_base64 || '').toString();
  const photo2 = (body.photo2_base64 || '').toString();
  const photo1Type = (body.photo1_content_type || 'image/jpeg').toString();
  const photo2Type = (body.photo2_content_type || 'image/jpeg').toString();

  if (!photo1 || !photo2) return res.status(400).json({ ok: false, error: 'two_photos_required' });

  const { data: creator, error: creatorError } = await adminClient
    .from('creators')
    .select('id, handle, name, display_name, main_category')
    .eq('user_id', user.id)
    .maybeSingle();
  if (creatorError || !creator) return res.status(404).json({ ok: false, error: 'creator_not_found' });

  try {
    const path1 = `photos/${creator.handle}/sample-1-${Date.now()}.jpg`;
    const path2 = `photos/${creator.handle}/sample-2-${Date.now()}.jpg`;

    const { error: upload1Error } = await adminClient.storage
      .from('creator-content')
      .upload(path1, Buffer.from(photo1, 'base64'), { upsert: true, contentType: photo1Type });
    if (upload1Error) throw new Error(upload1Error.message);

    const { error: upload2Error } = await adminClient.storage
      .from('creator-content')
      .upload(path2, Buffer.from(photo2, 'base64'), { upsert: true, contentType: photo2Type });
    if (upload2Error) throw new Error(upload2Error.message);

    const { error: updateError } = await adminClient
      .from('creators')
      .update({ sample_photo_1: path1, sample_photo_2: path2, status: 'pending' })
      .eq('id', creator.id);
    if (updateError) throw new Error(updateError.message);

    // No debe tumbar la respuesta si el email falla (Brevo caído, etc.)
    // — la aplicación ya quedó guardada.
    await notifyAdminsNewApplication(adminClient, creator)
      .catch(err => console.warn('[submit-application] no se pudo avisar a admins:', err.message));

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }
}
