import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env.js';

const supabaseUrl = requireEnv('SUPABASE_URL');
const serviceKey  = requireEnv('SUPABASE_SERVICE_ROLE');

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});
