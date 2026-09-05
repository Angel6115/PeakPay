// Bandera global "¿ya lanzamos de verdad?" — mientras esté en false, el
// registro (signup) sigue abierto pero nada más funciona (excepto para
// cuentas is_admin). Vive en la DB, no en env vars, para poder prenderla/
// apagarla desde /admin.html sin redeploy.
export async function isLaunched(adminClient) {
  const { data } = await adminClient
    .from('app_config')
    .select('value')
    .eq('key', 'launched')
    .maybeSingle();
  return data?.value === true;
}

// Para endpoints que mueven dinero o publican contenido: bloquea si la
// plataforma no está lanzada, a menos que quien pide sea admin. `user`
// puede ser null (endpoint público) — en ese caso nunca es admin.
export async function requireLaunchedOrAdmin(adminClient, user) {
  if (await isLaunched(adminClient)) return true;
  if (!user) return false;
  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  return !!profile?.is_admin;
}
