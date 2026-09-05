import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { notifyUserWelcome } from '../_lib/email.mjs';

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }
function strongEnough(s) { return String(s || '').length >= 8; }

// Signup gratuito e inmediato: crea la cuenta ya confirmada (sin esperar el
// email de verificación) y la activa de una vez — sin Stripe de por medio.
// El bono de créditos de bienvenida lo pone el DEFAULT de profiles.credits.
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const email = (body.email || '').toString().trim();
  const password = (body.password || '').toString();
  const roleRaw = (body.role || 'usuario').toString().trim().toLowerCase();
  const isCreator = roleRaw === 'creador' || roleRaw === 'creator';
  const role = isCreator ? 'creador' : 'usuario';
  const mainCategory = (body.main_category || '').toString().trim() || null;

  if (!isEmail(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!strongEnough(password)) return res.status(400).json({ ok: false, error: 'weak_password' });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, is_creator: isCreator },
  });

  if (createError) {
    const msg = (createError.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
      return res.status(409).json({ ok: false, error: 'email_in_use' });
    }
    return res.status(400).json({ ok: false, error: 'auth_error', detail: createError.message });
  }

  const userId = created.user.id;

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({
      early_access: true,
      paid_at: new Date().toISOString(),
      role,
      is_creator: isCreator,
    })
    .eq('id', userId);

  if (updateError) {
    console.warn('[signup-free] profile update error:', updateError.message);
  }

  if (isCreator) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('handle')
      .eq('id', userId)
      .single();

    const handle = profile?.handle || `creator-${userId.slice(0, 8)}`;
    const { error: creatorError } = await adminClient.from('creators').insert({
      user_id: userId,
      handle,
      name: email.split('@')[0] || handle,
      is_active: true,
      verified: false,
      main_category: mainCategory,
    });
    if (creatorError) {
      console.warn('[signup-free] no se pudo crear fila en creators:', creatorError.message);
    }
  } else {
    // Solo usuarios compradores — las creadoras reciben su propio aviso
    // cuando su aplicación se apruebe/rechace, no una bienvenida aparte.
    await notifyUserWelcome(email)
      .catch(err => console.warn('[signup-free] no se pudo enviar bienvenida:', err.message));
  }

  return res.status(200).json({ ok: true, user_id: userId, role });
}
