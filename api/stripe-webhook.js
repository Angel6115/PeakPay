// /api/stripe-webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

  // Solo manejamos checkout.session.completed por ahora
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Campos útiles
    const metadata = session.metadata || {};
    const email = session.customer_email || metadata.email || '';
    const userIdMeta = metadata.userId || '';
    const roleMeta = (metadata.role || metadata.type || '').toLowerCase();
    const isCreator = roleMeta === 'creator' || roleMeta === 'creador';

    console.log('💰 Pago completado', {
      sessionId: session.id,
      email,
      metadata,
      customer: session.customer
    });

    try {
      // 1) Resolver userId
      let finalUserId = userIdMeta;

      if (!finalUserId && email) {
        // Primero buscamos en profiles por email (más directo)
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .limit(1)
          .single();
        if (pErr) {
          console.warn('⚠️ Búsqueda en profiles por email falló (continuamos):', pErr.message);
        }
        if (p?.id) {
          finalUserId = p.id;
          console.log('✅ userId resuelto desde profiles.email:', finalUserId);
        }
      }

      if (!finalUserId && email) {
        // Fallback: auth admin list (costoso, pero última opción)
        const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) throw new Error(`Admin.listUsers error: ${listErr.message}`);
        const match = list.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        if (match) {
          finalUserId = match.id;
          console.log('✅ userId resuelto desde auth.users:', finalUserId);
        }
      }

      if (!finalUserId) {
        throw new Error(`No se pudo resolver userId (metadata.userId/email)`);
      }

      // 2) Activar acceso
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
async function activateAccess(userId, session, userType) {
  const isCreator = userType === 'creator';
  console.log(`🔓 Activando acceso para ${isCreator ? 'CREADOR' : 'USUARIO'} ${userId}`);

  // 1) Actualizar perfil principal
  const profileUpdate = {
    early_access: true,
    paid_at: new Date().toISOString(),
    stripe_customer_id: session.customer,
    stripe_session_id: session.id,
    is_creator: isCreator,
    role: isCreator ? 'creador' : 'usuario',
    founder_paid: true,
    founder_paid_at: new Date().toISOString(),
  };

  // Créditos: solo usuarios
  if (!isCreator) {
    profileUpdate.credits = 1000;
  } else {
    profileUpdate.credits = 0;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', userId);

  if (profileError) {
    console.error('❌ Error actualizando perfil:', profileError);
    throw new Error(`Actualizar perfil: ${profileError.message}`);
  }

  console.log(`✅ Perfil actualizado (${isCreator ? 'Creador 0 créditos' : 'Usuario 1000 créditos'})`);

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
        // Obtener datos básicos del perfil
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

  // 3) Transacción de créditos (solo usuarios)
  if (!isCreator) {
    try {
      const { error: txnError } = await supabase
        .from('wallet_txns')
        .insert({
          user_key: userId,
          credits_delta: 1000,
          usd_delta: 10.00,
          type: 'topup',
          meta: {
            description: 'Early Access Bonus - 1,000 Peak Credits',
            source: 'stripe_webhook',
            session_id: session.id
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
