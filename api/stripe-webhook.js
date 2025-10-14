// api/stripe-webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Inicializar cliente de Supabase con SERVICE ROLE KEY (para el backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ NO usar anon key aquí, debe ser service_role
);

// Buffer para leer el raw body (necesario para verificar firma de Stripe)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper para leer el body como buffer
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
    console.error('❌ STRIPE_WEBHOOK_SECRET no está configurado');
    return res.status(500).json({ error: 'Webhook secret no configurado' });
  }

  let event;

  try {
    // Leer el body raw
    const buf = await buffer(req);
    
    // Verificar la firma de Stripe
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Error verificando firma del webhook:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Manejar el evento
  console.log('✅ Webhook recibido:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log('💰 Pago completado:', {
      sessionId: session.id,
      email: session.customer_email,
      metadata: session.metadata,
    });

    try {
      const { email, userId, type } = session.metadata;

      if (!userId) {
        console.warn('⚠️ No se encontró userId en metadata, buscando por email');
        
        // Fallback: buscar usuario por email
        const { data: profile, error: findError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (findError || !profile) {
          throw new Error(`No se pudo encontrar usuario con email ${email}`);
        }

        // Actualizar con el ID encontrado
        await activateAccess(profile.id, session, type);
      } else {
        // Tenemos userId directamente
        await activateAccess(userId, session, type);
      }

      return res.status(200).json({ received: true, message: 'Acceso activado' });
    } catch (err) {
      console.error('❌ Error procesando pago:', err);
      return res.status(500).json({ error: 'Error procesando pago', message: err.message });
    }
  }

  // Otros eventos (por ahora solo logueamos)
  console.log('ℹ️ Evento no manejado:', event.type);
  return res.status(200).json({ received: true });
}

// Función para activar acceso del usuario
async function activateAccess(userId, session, userType) {
  const isCreator = userType === 'creator';

  console.log(`🔓 Activando acceso para usuario ${userId}`);

  // PASO 1: Actualizar perfil principal
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      early_access: true,
      paid_at: new Date().toISOString(),
      stripe_customer_id: session.customer,
      stripe_session_id: session.id,
      is_creator: isCreator,
      role: isCreator ? 'creador' : 'usuario',
    })
    .eq('id', userId);

  if (profileError) {
    console.error('❌ Error actualizando perfil:', profileError);
    throw new Error(`Error actualizando perfil: ${profileError.message}`);
  }

  console.log('✅ Perfil actualizado');

  // PASO 2: Si es creador, crear entrada en tabla creators
  if (isCreator) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('handle, display_name, email')
      .eq('id', userId)
      .single();

    const { error: creatorError } = await supabase
      .from('creators')
      .upsert({
        user_id: userId,
        handle: profile?.handle || 'creator',
        name: profile?.display_name || profile?.email?.split('@')[0] || 'Creator',
        is_active: true,
        verified: false,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (creatorError) {
      console.warn('⚠️ Error creando entrada de creador:', creatorError);
      // No lanzamos error aquí, el perfil ya está actualizado
    } else {
      console.log('✅ Entrada de creador creada');
    }
  }

  // PASO 3: Crear transacción de créditos iniciales (1000 créditos gratis)
  try {
    const { error: txnError } = await supabase
      .from('wallet_txns')
      .insert({
        user_key: userId, // ✅ CORREGIDO: usar user_key en lugar de user_id
        credits_delta: 1000, // ✅ CORREGIDO: usar credits_delta en lugar de amount
        usd_delta: 10.00,
        type: 'credit',
        meta: { 
          description: 'Early Access Bonus - 1,000 Peak Credits',
          source: 'stripe_webhook',
          session_id: session.id
        },
        created_at: new Date().toISOString(),
      });

    if (txnError) {
      console.warn('⚠️ Error creando transacción de créditos:', txnError);
    } else {
      console.log('✅ 1,000 créditos agregados');
    }
  } catch (txnErr) {
    console.warn('⚠️ Error en transacción de créditos:', txnErr);
    // No lanzamos error, lo importante es que el acceso está activado
  }

  console.log('🎉 Acceso completamente activado para', userId);
}