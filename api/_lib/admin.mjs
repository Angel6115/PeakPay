import { getUserFromRequest } from './auth.mjs';

// Igual que getUserFromRequest, pero además exige profiles.is_admin = true.
// Devuelve null si no hay sesión o si el usuario no es admin (mismo shape
// que getUserFromRequest para que los endpoints puedan reusar el patrón
// `if (!user) return res.status(401/403)...`).
export async function requireAdmin(adminClient, req) {
  const user = await getUserFromRequest(req);
  if (!user) return null;

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;
  return user;
}
