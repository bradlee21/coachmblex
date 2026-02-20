import { getSupabaseClient } from './supabaseClient';

function withTimeout(promise, ms = 8000, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

export async function postgrestFetch(
  path,
  { method = 'GET', body, headers = {}, signal } = {}
) {
  const rawBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawBase || !anonKey) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorText: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const normalizedBase = rawBase.startsWith('http') ? rawBase : `https://${rawBase}`;
  const base = normalizedBase.replace(/\/$/, '');
  const normalizedPath = String(path || '').replace(/^\//, '');
  const url = `${base}/rest/v1/${normalizedPath}`;

  let accessToken = null;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        1000,
        'postgrest_get_session'
      );
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
    accept: 'application/json',
    ...headers,
  };

  if (body !== undefined) {
    mergedHeaders['content-type'] = 'application/json';
    mergedHeaders.prefer = mergedHeaders.prefer || 'return=representation';
  }

  const response = await fetch(url, {
    method,
    headers: mergedHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  let text = '';
  try {
    text = await withTimeout(response.text(), 8000, 'postgrest_response_text');
  } catch (error) {
    text = error instanceof Error ? error.message : 'Failed to read response text.';
  }

  let parsed = null;

  const trimmed = text.trim();
  if (trimmed && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
    errorText: text,
  };
}
