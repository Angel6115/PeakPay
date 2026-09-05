import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { requireAdmin } from '../_lib/admin.mjs';

// GET /api/admin/overview — KPIs esenciales para monitorear la plataforma
// de un vistazo: usuarios, creadoras, aplicaciones pendientes, suscripciones
// activas, y el dinero en juego (pendiente de pagar a creadoras).
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireAdmin(adminClient, req);
  if (!admin) return res.status(403).json({ ok: false, error: 'forbidden' });

  const [
    { count: totalUsers },
    { count: totalCreators },
    { count: pendingApplications },
    { count: activeSubscriptions },
    { data: earningsRows },
    { data: payoutRows },
  ] = await Promise.all([
    adminClient.from('profiles').select('id', { count: 'exact', head: true }),
    adminClient.from('creators').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    adminClient.from('creators').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    adminClient.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    adminClient.from('profiles').select('creator_earnings').gt('creator_earnings', 0),
    adminClient.from('payouts').select('amount_usd'),
  ]);

  const totalEarned = (earningsRows || []).reduce((sum, r) => sum + Number(r.creator_earnings || 0), 0);
  const totalPaidOut = (payoutRows || []).reduce((sum, r) => sum + Number(r.amount_usd || 0), 0);
  const totalPendingPayouts = Math.round((totalEarned - totalPaidOut) * 100) / 100;

  const { data: recentSignups } = await adminClient
    .from('profiles')
    .select('id, email, handle, is_creator, created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  return res.status(200).json({
    ok: true,
    total_users: totalUsers || 0,
    total_creators: totalCreators || 0,
    pending_applications: pendingApplications || 0,
    active_subscriptions: activeSubscriptions || 0,
    total_creator_earnings_usd: Math.round(totalEarned * 100) / 100,
    total_paid_out_usd: Math.round(totalPaidOut * 100) / 100,
    total_pending_payouts_usd: totalPendingPayouts,
    recent_signups: recentSignups || [],
  });
}
