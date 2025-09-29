import { publicClient } from './_lib/supabase.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { email, redirectTo } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!email) return res.status(400).json({ error: 'Email required' });

    const origin = process.env.SITE_ORIGIN || `https://${req.headers.host}`;
    const emailRedirectTo = redirectTo || `${origin}/check-email`;

    const { error } = await publicClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Internal error' });
  }
}
