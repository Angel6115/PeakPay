// Acredita ganancias reales a un creador cuando alguien paga por su
// contenido (unlock con créditos o suscripción). Sin esto, creator_earnings
// y creator-wallet.html se quedan en $0.00 para siempre — no hay ningún otro
// lugar del sistema que conecte una compra con lo que gana el creador.
//
// NOTA: read-then-write no atómico, mismo patrón/limitación que
// api/unlock.js — migrar a RPC cuando haya tráfico real.
export async function creditCreatorEarnings(adminClient, creatorRowId, usdAmount, meta) {
  if (!creatorRowId || !usdAmount || usdAmount <= 0) return;

  const { data: creator } = await adminClient
    .from('creators')
    .select('user_id')
    .eq('id', creatorRowId)
    .maybeSingle();

  const creatorUserId = creator?.user_id;
  if (!creatorUserId) return; // creador sin cuenta vinculada (demo/seed) — nada que acreditar

  const { data: profile } = await adminClient
    .from('profiles')
    .select('creator_earnings')
    .eq('id', creatorUserId)
    .single();

  const current = Number(profile?.creator_earnings) || 0;
  const rounded = Math.round((current + usdAmount) * 100) / 100;

  await adminClient
    .from('profiles')
    .update({ creator_earnings: rounded })
    .eq('id', creatorUserId);

  await adminClient.from('wallet_txns').insert({
    user_key: creatorUserId,
    credits_delta: 0,
    usd_delta: usdAmount,
    type: 'earning',
    meta: meta || {},
  });
}
