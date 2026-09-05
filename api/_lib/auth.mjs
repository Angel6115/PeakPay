import { publicClient } from './supabase.mjs';

// Lee Authorization: Bearer <token>, valida la sesión contra Supabase y
// devuelve el user real, o null si no hay token o la sesión no es válida.
export async function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const token = m[1];
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user;
}
