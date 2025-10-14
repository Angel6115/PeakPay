// api/stripe-webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Inicializar cliente de Supabase con SERVICE ROLE KEY (para el backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
      const { email, userId, type, role } = session.metadata;
      let finalUserId = userId;

      // Si no tenemos userId, buscar en auth.users por email
      if (!finalUserId) {
        console.warn('⚠️ No se encontró userId en metadata, buscando por email en auth.users');
        
        // ✅ CORRECCIÓN: Buscar en auth.users, NO en profiles
        const { data: authUser, error: findError } = await supabase.auth.admin.listUsers();
        
        if (findError) {
          throw new Error(`Error buscando usuario: ${findError.message}`);
        }

        const user = authUser.users.find(u => u.email === email);
        
        if (!user) {
          throw new Error(`No se pudo encontrar usuario con email ${email}`);
        }

        finalUserId = user.id;
        console.log(`✅ Usuario encontrado por email: ${finalUserId}`);
      }

      // Activar acceso con el userId correcto
      const userType = role === 'creator' ? 'creator' : (type === 'creator' ? 'creator' : 'user');
      await activateAccess(finalUserId, session, userType);

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

  console.log(`🔓 Activando acceso para usuario ${userId} (tipo: ${userType})`);

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
    // Obtener email del usuario desde auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email || 'unknown';

    const { data: profile } = await supabase
      .from('profiles')
      .select('handle, display_name')
      .eq('id', userId)
      .single();

    const { error: creatorError } = await supabase
      .from('creators')
      .upsert({
        user_id: userId,
        handle: profile?.handle || `creator-${userId.slice(0, 8)}`,
        name: profile?.display_name || userEmail.split('@')[0] || 'Creator',
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
        user_key: userId,
        credits_delta: 1000,
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
  }

  console.log('🎉 Acceso completamente activado para', userId);
}