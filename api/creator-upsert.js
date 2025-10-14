// api/creator-upsert.js
// Upsert de creadores en Supabase (uso inicial para prelaunch).
// Seguridad mínima (origen + validaciones). Más adelante moveremos a Webhook de Stripe.

export default async function handler(req, res) {
    // CORS básico para desarrollo local y Vercel
    const ORIGIN = req.headers.origin || '';
    const allowOrigins = [
      'http://localhost:5173',
      'https://peak-pay.vercel.app',
      // agrega aquí tus dominios de Vercel (preview/prod) si usas varios
    ];
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', ORIGIN);
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }
    if (!allowOrigins.includes(ORIGIN)) {
      // En prelaunch, filtramos por origen para evitar abuso trivial
      return res.status(403).json({ error: 'Forbidden origin' });
    }
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // **clave secreta**
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(500).json({ error: 'Supabase env vars missing' });
    }
  
    try {
      const body = req.body || {};
      const role = String(body.role || '').toLowerCase();
  
      if (role !== 'creator') {
        // Para usuarios NO hacemos nada (por ahora).
        return res.status(200).json({ ok: true, skipped: true });
      }
  
      const email = String(body.email || '').trim();
      const handle = String(body.handle || '').trim();
      const display_name = (body.display_name ?? body.displayName ?? '').toString().trim();
      const main_category = (body.main_category ?? body.category ?? '').toString().trim();
      const avatar_url = (body.avatar_url ?? body.avatarUrl ?? '').toString().trim();
      const user_id = body.user_id ? String(body.user_id) : null; // opcional (si en el futuro usas auth)
  
      // Validaciones mínimas
      if (!/^[a-z0-9_-]{3,30}$/i.test(handle)) {
        return res.status(400).json({ error: 'handle inválido' });
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'email inválido' });
      }
  
      // Construye payload para upsert
      const row = {
        handle,
        display_name: display_name || null,
        avatar_url: avatar_url || null,
        main_category: main_category || null,
        is_active: true,
      };
      if (email) row.email = email;          // si añadiste la columna email en creators
      if (user_id) row.user_id = user_id;    // si tienes auth.user ligado
  
      // Upsert via REST (on_conflict=handle) para mantener unicidad por handle.
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/creators?on_conflict=handle`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([row]),
      });
  
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ error: 'supabase_error', details: data });
      }
  
      // data debería ser un array con la fila resultante
      return res.status(200).json({ ok: true, creator: Array.isArray(data) ? data[0] : data });
    } catch (err) {
      console.error('creator-upsert error', err);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  }
  