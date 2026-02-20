import { getSupabaseClient } from './supabaseClient';

export async function postgrestFetch(
  path,
  { method = 'GET', body, headers = {}, signal } = {}
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorText: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  let accessToken = null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        accessToken = data?.session?.access_token || null;
      }
    } catch {
      accessToken = null;
    }
  }

  const mergedHeaders = {
    apikey: anonKey,
    authorization: `Bearer ${accessToken || anonKey}`,
    ...headers,
  };

  if (body !== undefined) {
    mergedHeaders['content-type'] = mergedHeaders['content-type'] || 'application/json';
    mergedHeaders.prefer = mergedHeaders.prefer || 'return=representation';
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: mergedHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
    errorText: response.ok ? '' : text,
  };
}
