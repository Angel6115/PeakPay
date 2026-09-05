import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';
import { resolveCreatorId } from '../_lib/creators.mjs';
import { requireLaunchedOrAdmin } from '../_lib/platform.mjs';

// Crea un set (contenido subido por un creador). Hecho server-side con el
// admin client a propósito: el INSERT directo del cliente choca con las
// políticas RLS de la tabla `sets`, y de todas formas creator_id necesita
// resolverse contra creators.id (no el id de auth) antes de insertar.
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
  const title = (body.title || 'Sin título').toString().trim();
  const category = (body.category || 'General').toString().trim();
  const price = Number(body.price) || 5.0;
  const teaserPath = (body.teaser_path || '').toString().trim();
  // cover_path es NOT NULL en la DB; si no subieron avatar/cover aparte,
  // usamos la misma imagen del set como cover por defecto.
  const avatarPath = (body.avatar_path || '').toString().trim() || teaserPath;
  const grid = Math.max(3, Math.min(5, Math.floor(Number(body.grid) || 4)));
  const isPublished = !!body.is_published;

  if (!teaserPath) return res.status(400).json({ ok: false, error: 'teaser_path_required' });

  const { data: profile } = await adminClient
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .single();
  const handle = profile?.handle || `creator-${user.id.slice(0, 8)}`;

  let creatorId;
  try {
    creatorId = await resolveCreatorId(adminClient, user.id, handle);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }

  const setSlug = `set-${Date.now()}`;

  const { data, error } = await adminClient
    .from('sets')
    .insert({
      creator_id: creatorId,
      slug: setSlug,
      set_slug: setSlug,
      creator_slug: handle,
      grid,
      title,
      blurb: category,
      cover_url: avatarPath ? `/${avatarPath}` : null,
      full_asset_key: teaserPath,
      full_path: teaserPath,
      path: teaserPath,
      cover_path: avatarPath,
      cover_asset_key: avatarPath,
      is_active: isPublished,
      price,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });
  }

  return res.status(200).json({ ok: true, set: data });
}
