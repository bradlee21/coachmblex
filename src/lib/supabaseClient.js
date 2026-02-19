import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserClient = null;

function hasValidConfig() {
  return (
    typeof supabaseUrl === 'string' &&
    /^https?:\/\//.test(supabaseUrl) &&
    typeof supabaseAnonKey === 'string' &&
    supabaseAnonKey.length > 0
  );
}

export function getSupabaseClient() {
  if (typeof window === 'undefined') return null;
  if (!hasValidConfig()) return null;
  if (browserClient) return browserClient;

  browserClient = createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
