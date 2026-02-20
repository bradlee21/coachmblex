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

function extractAccessToken(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return extractAccessToken(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = extractAccessToken(item);
      if (token) return token;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  if (typeof value.access_token === 'string' && value.access_token.trim()) {
    return value.access_token;
  }

  const nestedCandidates = [
    value.currentSession,
    value.session,
    value.data,
    value.data?.session,
  ];
  for (const candidate of nestedCandidates) {
    const token = extractAccessToken(candidate);
    if (token) return token;
  }
  return null;
}

function getStoredAccessToken(projectRef) {
  if (!projectRef) return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    return extractAccessToken(raw);
  } catch {
    return null;
  }
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
  const requestMethod = String(method || 'GET').toUpperCase();
  const isWrite = !['GET', 'HEAD'].includes(requestMethod);
  const projectRef = (() => {
    try {
      return new URL(base).hostname.split('.')[0] || '';
    } catch {
      return '';
    }
  })();

  const accessToken = getStoredAccessToken(projectRef);

  if (!accessToken && isWrite) {
    return {
      ok: false,
      status: 401,
      data: null,
      errorText: 'Authenticated session required for write request (no access token).',
    };
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
