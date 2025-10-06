// api/stripe-webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Desactivar body parsing de Vercel para poder leer raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

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

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const email = session.customer_email || session.metadata?.email;
      const stripeCustomerId = session.customer;
      const stripeSessionId = session.id;

      if (!email) {
        console.error('No email found in session');
        return res.status(400).json({ error: 'No email in session' });
      }

      console.log('Processing payment for:', email);

      // 1. Crear usuario en Supabase Auth (si no existe)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
        user_metadata: {
          early_access: true,
          source: 'stripe_checkout'
        }
      });

      if (authError && !authError.message.includes('already registered')) {
        console.error('Error creating auth user:', authError);
        return res.status(500).json({ error: 'Error creating user' });
      }

      const userId = authData?.user?.id;

      // 2. Actualizar o crear profile
      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: email,
            early_access: true,
            paid_at: new Date().toISOString(),
            stripe_customer_id: stripeCustomerId,
            stripe_session_id: stripeSessionId,
            credits: 1000, // 1,000 créditos iniciales
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          });

        if (profileError) {
          console.error('Error updating profile:', profileError);
        } else {
          console.log('Profile updated successfully for:', email);
        }
      }

      // 3. TODO: Enviar email de bienvenida (opcional)
      // Puedes usar Resend, SendGrid, etc.

      return res.status(200).json({ 
        received: true,
        email: email,
        user_id: userId 
      });

    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Otros eventos que quieras manejar
  else if (event.type === 'payment_intent.payment_failed') {
    console.log('Payment failed:', event.data.object);
  }

  res.status(200).json({ received: true });
}