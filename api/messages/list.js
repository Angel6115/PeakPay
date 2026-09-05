import { adminClient } from '../_lib/supabase.mjs';
import { withCORS } from '../_lib/cors.mjs';
import { getUserFromRequest } from '../_lib/auth.mjs';

// GET /api/messages/list?direction=inbox|sent&with=<user_id opcional>
export default async function handler(req, res) {
  if (withCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const direction = (req.query.direction || 'inbox').toString();
  const withUser = (req.query.with || '').toString().trim();

  let query = adminClient.from('messages').select('*').order('created_at', { ascending: false });
  query = direction === 'sent' ? query.eq('from_user', user.id) : query.eq('to_user', user.id);
  if (withUser) {
    query = direction === 'sent' ? query.eq('to_user', withUser) : query.eq('from_user', withUser);
  }

  const { data: messages, error } = await query;
  if (error) return res.status(500).json({ ok: false, error: 'internal_error', detail: error.message });

  const otherIds = [...new Set((messages || []).map(m => (direction === 'sent' ? m.to_user : m.from_user)))];
  let peopleById = {};
  if (otherIds.length) {
    const { data: people } = await adminClient
      .from('profiles')
      .select('id, handle, email, display_name')
      .in('id', otherIds);
    peopleById = Object.fromEntries((people || []).map(p => [p.id, p]));
  }

  const withPeople = (messages || []).map(m => ({
    ...m,
    person: peopleById[direction === 'sent' ? m.to_user : m.from_user] || null,
  }));

  return res.status(200).json({ ok: true, messages: withPeople });
}
