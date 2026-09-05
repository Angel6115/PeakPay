// sets.creator_id apunta a creators.id, NUNCA al id de auth del usuario —
// son filas distintas. Resuelve (o crea si falta) la fila en `creators`
// del usuario dado y devuelve su id real.
export async function resolveCreatorId(adminClient, userId, fallbackHandle) {
  const { data: existing, error: readError } = await adminClient
    .from('creators')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) throw new Error(`Leyendo creators: ${readError.message}`);
  if (existing?.id) return existing.id;

  let handle = fallbackHandle;
  if (!handle) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('handle')
      .eq('id', userId)
      .single();
    handle = profile?.handle || `creator-${userId.slice(0, 8)}`;
  }

  const { data: created, error: createError } = await adminClient
    .from('creators')
    .insert({ user_id: userId, handle, is_active: true, verified: false })
    .select('id')
    .single();

  if (createError) throw new Error(`Creando creators: ${createError.message}`);
  return created.id;
}
