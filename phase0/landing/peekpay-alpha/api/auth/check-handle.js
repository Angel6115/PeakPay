// api/auth/check-handle.js
import { adminClient } from '../_lib/supabase.mjs';

// misma regla que el front
const isHandle = (s) => /^[a-z0-9._]{3,30}$/.test(String(s || ''));

export default async function handler(req, res) {
  // Si acaso haces llamadas cross-origin en el futuro, puedes habilitar CORS rápido:
  // if (req.method === 'OPTIONS') {
  //   res.setHeader('Access-Control-Allow-Origin', '*');
  //   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  //   return res.status(204).end();
  // }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const url = new URL(req.url, 'http://localhost'); // base dummy OK en Vercel
    const handle = (url.searchParams.get('handle') || '').toLowerCase().trim();

    if (!isHandle(handle)) {
      return res.status(400).json({ ok: false, valid: false, reason: 'invalid' });
    }

    // Si aún no quieres tocar la DB, fail-open para buena UX
    if (!adminClient) {
      return res.status(200).json({ ok: true, valid: true, available: true });
    }

    // Cuando tengas la tabla "profiles" con columna "handle", descomenta:
    // const { data, error } = await adminClient
    //   .from('profiles')
    //   .select('id', { count: 'exact', head: true })
    //   .eq('handle', handle);
    // if (error) {
    //   console.warn('[check-handle] db error:', error.message);
    //   return res.status(200).json({ ok: true, valid: true, available: true });
    // }
    // const available = (data?.length ?? 0) === 0;
    // return res.status(200).json({ ok: true, valid: true, available });

    // Placeholder hasta que exista la tabla:
    return res.status(200).json({ ok: true, valid: true, available: true });
  } catch (e) {
    console.error('[check-handle] unexpected:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
