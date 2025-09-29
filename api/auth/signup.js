import { publicClient } from './_lib/supabase.mjs';
import { withCORS } from './_lib/cors.mjs';

export default async function handler(req, res) {
  if (withCORS(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { email, redirectTo } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    const origin = process.env.SITE_ORIGIN || `https://${req.headers.host}`;
    const emailRedirectTo = redirectTo || `${origin}/check-email`;

    const { error } = await publicClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) return res.status(400).json({ error: 'auth_error' });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
}
