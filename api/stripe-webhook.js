// /api/stripe-webhook.js
//
// ⚠️ TODO antes de procesar el primer pago REAL (no test): Stripe prohíbe en
// sus ToS el contenido sexual/adulto y las plataformas que dan acceso a ese
// tipo de contenido — es la razón por la que OnlyFans/Fansly/Fanvue NO usan
// Stripe para cobrar, usan procesadores de "alto riesgo" (CCBill, Segpay,
// Epoch, Vendo, Corepay). Usar Stripe en LIVE aquí arriesga que congelen la
// cuenta sin aviso, incluyendo fondos pendientes de pago a creadoras. Migrar
// create-subscription-session.js / create-checkout-session.js / este archivo
// al procesador elegido ANTES de aceptar el primer pago real. La lógica de
// negocio (créditos, ganancias, suscriptores) no depende de Stripe
// específicamente, así que el resto del sistema no debería cambiar.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { creditCreatorEarnings } from './_lib/earnings.mjs';

const CREATOR_SHARE = 0.85;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Supabase con SERVICE ROLE (backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Vercel/Next: necesitamos raw body para verificar firma
export const config = { api: { bodyParser: false } };

// Helper para leer raw body
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// UUID (v1–v5)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ Falta STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook secret no configurado' });
  }

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Verificación de firma falló:', err?.message);
    return res.status(400).json({ error: `Invalid signature: ${err?.message}` });
  }

  console.log('✅ Webhook recibido:', event.type);

  if (event.type === 'checkout.session.completed' && session_is_subscription(event)) {
    try {
      await activateSubscription(event.data.object);
      return res.status(200).json({ received: true, message: 'Suscripción activada' });
    } catch (err) {
      console.error('❌ Error activando suscripción:', err);
      return res.status(500).json({ error: 'Error activando suscripción', message: err?.message });
    }
  }

  if (event.type === 'checkout.session.completed' && event.data.object.metadata?.type === 'credit_topup') {
    try {
      await grantTopupCredits(event.data.object);
      return res.status(200).json({ received: true, message: 'Créditos acreditados' });
    } catch (err) {
      console.error('❌ Error acreditando créditos:', err);
      return res.status(500).json({ error: 'Error acreditando créditos', message: err?.message });
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    try {
      await syncSubscriptionStatus(event.data.object, event.type);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('❌ Error sincronizando suscripción:', err);
      return res.status(500).json({ error: 'Error sincronizando suscripción', message: err?.message });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Campos útiles
    const metadata = session.metadata || {};
    const email = session.customer_email || metadata.email || '';
    const rawUserId = (metadata.userId || '').trim();
    const roleMeta = (metadata.role || metadata.type || '').toLowerCase();
    const isCreator = roleMeta === 'creator' || roleMeta === 'creador';

    console.log('💰 Pago completado', {
      sessionId: session.id,
      email,
      metadata,
      customer: session.customer || null,
    });

    try {
      // 1) Resolver userId con guard de UUID
      let finalUserId = UUID_RE.test(rawUserId) ? rawUserId : '';

      if (!finalUserId && email) {
        // Resolver por profiles.email (más directo)
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .limit(1)
          .single();
        if (pErr) console.warn('⚠️ lookup profiles por email:', pErr.message);
        if (p?.id) {
          finalUserId = p.id;
          console.log('✅ userId desde profiles.email:', finalUserId);
        }
      }

      if (!finalUserId && email) {
        // Fallback: auth admin list (último recurso)
        const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) throw new Error(`Admin.listUsers error: ${listErr.message}`);
        const match = list.users.find(
          (u) => u.email && u.email.toLowerCase() === email.toLowerCase()
        );
        if (match?.id) {
          finalUserId = match.id;
          console.log('✅ userId desde auth.users:', finalUserId);
        }
      }

      if (!finalUserId) {
        throw new Error('No se pudo resolver userId (metadata.userId/email)');
      }

      // 2) **IDEMPOTENCIA**: si ya existe una wallet_txns para este session_id + user, no hacemos nada
      const { data: prev, error: prevErr } = await supabase
        .from('wallet_txns')
        .select('id')
        .eq('user_key', finalUserId)
        .eq('type', 'topup')
        // JSON contains: meta.session_id === session.id
        .contains('meta', { session_id: session.id })
        .limit(1);
      if (prevErr) {
        console.warn('⚠️ Error verificando idempotencia en wallet_txns:', prevErr.message);
      }
      if (prev && prev.length > 0) {
        console.log('🟰 Evento repetido (idempotente). Ya existe wallet_txns para esta sesión; no se duplica.');
        // Aun así, asegurar perfil actualizado (idempotente también)
        await ensureProfileFlags(finalUserId, session, isCreator);
        return res.status(200).json({ received: true, message: 'Evento repetido (sin duplicar créditos)' });
      }

      // 3) Activar acceso (incluye creación de wallet_txns si aplica)
      await activateAccess(finalUserId, session, isCreator ? 'creator' : 'user');

      return res.status(200).json({ received: true, message: 'Acceso activado' });
    } catch (err) {
      console.error('❌ Error procesando pago:', err);
      return res.status(500).json({ error: 'Error procesando pago', message: err?.message });
    }
  }

  // Otros eventos: solo log
  console.log('ℹ️ Evento no manejado:', event.type);
  return res.status(200).json({ received: true });
}

// ---- helpers ----

// Acredita una recarga de créditos comprada con dinero real. Idempotente:
// revisa si ya existe un wallet_txns para este session.id antes de acreditar
// (Stripe puede reenviar el mismo evento más de una vez).
async function grantTopupCredits(session) {
  const { user_id: userId, credits, usd } = session.metadata || {};
  if (!UUID_RE.test(userId)) throw new Error('metadata de recarga inválida (user_id no es UUID)');

  const { data: prev } = await supabase
    .from('wallet_txns')
    .select('id')
    .eq('user_key', userId)
    .eq('type', 'topup')
    .contains('meta', { session_id: session.id })
    .limit(1);

  if (prev && prev.length > 0) {
    console.log('🟰 Recarga repetida (idempotente), no se duplica.');
    return;
  }

  const creditsNum = Number(credits) || 0;

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();
  if (readError) throw new Error(`Leyendo profile: ${readError.message}`);

  const newCredits = (Number(profile?.credits) || 0) + creditsNum;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: newCredits })
    .eq('id', userId);
  if (updateError) throw new Error(`Actualizando credits: ${updateError.message}`);

  await supabase.from('wallet_txns').insert({
    user_key: userId,
    credits_delta: creditsNum,
    usd_delta: Number(usd) || 0,
    type: 'topup',
    meta: { description: `Recarga de ${creditsNum} Peak Credits`, source: 'stripe_topup', session_id: session.id },
  });

  console.log(`✅ ${creditsNum} créditos acreditados a ${userId}`);
}

function session_is_subscription(event) {
  const session = event.data.object;
  return session.mode === 'subscription' && session.metadata?.type === 'creator_subscription';
}

// Crea/reactiva la fila en `subscriptions` cuando el checkout de suscripción
// se completa. Usa upsert sobre (user_id, creator_id) para que re-suscribirse
// después de cancelar reactive la misma fila en vez de duplicarla.
async function activateSubscription(session) {
  const { user_id: userId, creator_id: creatorId, price_usd: priceUsd } = session.metadata || {};
  if (!UUID_RE.test(userId) || !UUID_RE.test(creatorId)) {
    throw new Error('metadata de suscripción inválida (user_id/creator_id no son UUID)');
  }

  const stripeSub = await stripe.subscriptions.retrieve(session.subscription);

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        creator_id: creatorId,
        status: 'active',
        price_usd: Number(priceUsd) || 0,
        stripe_subscription_id: stripeSub.id,
        stripe_customer_id: session.customer,
        current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
        canceled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,creator_id' }
    );

  if (error) throw new Error(`Guardando subscription: ${error.message}`);
  console.log(`✅ Suscripción activa: user=${userId} creator=${creatorId}`);

  const creatorCut = Math.round(Number(priceUsd) * CREATOR_SHARE * 100) / 100;
  await creditCreatorEarnings(supabase, creatorId, creatorCut, {
    source: 'subscription',
    creator_id: creatorId,
    subscriber_id: userId,
    stripe_subscription_id: stripeSub.id,
  });
}

// Mantiene `subscriptions.status`/`current_period_end` en sync con los
// eventos de ciclo de vida de Stripe (renovación, cancelación, etc.)
async function syncSubscriptionStatus(stripeSub, eventType) {
  const isDeleted = eventType === 'customer.subscription.deleted';
  const update = {
    status: isDeleted ? 'canceled' : stripeSub.status,
    current_period_end: stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
  if (isDeleted) update.canceled_at = new Date().toISOString();

  const { error } = await supabase
    .from('subscriptions')
    .update(update)
    .eq('stripe_subscription_id', stripeSub.id);

  if (error) throw new Error(`Sincronizando subscription: ${error.message}`);
  console.log(`ℹ️ Subscription ${stripeSub.id} -> ${update.status}`);
}

// Asegura flags/ids en profiles (idempotente)
async function ensureProfileFlags(userId, session, isCreator) {
  const update = {
    early_access: true,
    paid_at: new Date().toISOString(),
    stripe_customer_id: session.customer || null,
    stripe_session_id: session.id,
    is_creator: isCreator,
    role: isCreator ? 'creador' : 'usuario',
    founder_paid: true,
    founder_paid_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  if (error) console.warn('⚠️ ensureProfileFlags:', error.message);
}

// Activa acceso y escribe transacción (con guardas)
async function activateAccess(userId, session, userType) {
  // Defensa adicional: nunca operar con userId no-UUID
  if (!UUID_RE.test(userId)) {
    throw new Error('userId inválido (no UUID)');
  }

  const isCreator = userType === 'creator';
  console.log(`🔓 Activando acceso para ${isCreator ? 'CREADOR' : 'USUARIO'} ${userId}`);

  // 1) Actualizar perfil principal (idempotente por SET)
  const profileUpdate = {
    early_access: true,
    paid_at: new Date().toISOString(),
    stripe_customer_id: session.customer || null,
    stripe_session_id: session.id,
    is_creator: isCreator,
    role: isCreator ? 'creador' : 'usuario',
    founder_paid: true,
    founder_paid_at: new Date().toISOString(),
    credits: isCreator ? 0 : 1000, // créditos para user
  };

  {
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId);

    if (profileError) {
      console.error('❌ Error actualizando perfil:', profileError);
      throw new Error(`Actualizar perfil: ${profileError.message}`);
    }
  }

  console.log(
    `✅ Perfil actualizado (${isCreator ? 'Creador 0 créditos' : 'Usuario 1000 créditos'})`
  );

  // 2) Si es creador, asegurar fila en creators
  if (isCreator) {
    try {
      const { data: existing } = await supabase
        .from('creators')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing?.id) {
        await supabase
          .from('creators')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        console.log('✅ Creator actualizado');
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('handle, display_name, email')
          .eq('id', userId)
          .single();

        await supabase
          .from('creators')
          .insert({
            user_id: userId,
            handle: profile?.handle || `creator-${userId.slice(0, 8)}`,
            name: profile?.display_name || (profile?.email?.split('@')[0] ?? 'Creator'),
            is_active: true,
            verified: false,
            created_at: new Date().toISOString(),
          });
        console.log('✅ Creator creado');
      }
    } catch (e) {
      console.warn('⚠️ Error gestionando tabla creators:', e?.message);
    }
  }

  // 3) Transacción de créditos (solo usuarios) con **idempotencia**:
  //    antes ya verificamos si existía; aquí insertamos la nueva.
  if (!isCreator) {
    try {
      const { error: txnError } = await supabase
        .from('wallet_txns')
        .insert({
          user_key: userId,               // TEXT en tu schema; UUID como string es válido
          credits_delta: 1000,
          usd_delta: 10.0,
          type: 'topup',
          meta: {
            description: 'Early Access Bonus - 1,000 Peak Credits',
            source: 'stripe_webhook',
            session_id: session.id,
          },
          created_at: new Date().toISOString(),
        });

      if (txnError) {
        console.warn('⚠️ Error creando wallet_txns:', txnError?.message);
      } else {
        console.log('✅ 1,000 créditos agregados en wallet_txns');
      }
    } catch (e) {
      console.warn('⚠️ Excepción creando wallet_txns:', e?.message);
    }
  } else {
    console.log('ℹ️ Creador configurado con 0 créditos');
  }

  console.log(`🎉 Acceso activado para ${isCreator ? 'CREADOR' : 'USUARIO'} ${userId}`);
}
