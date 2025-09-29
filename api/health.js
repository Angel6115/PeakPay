export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE,
    },
    ts: new Date().toISOString(),
  });
}
