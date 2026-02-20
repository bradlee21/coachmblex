import { existsSync, readFileSync } from 'node:fs';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

function normalizeEnvValue(value) {
  const raw = String(value || '').trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = normalizeEnvValue(trimmed.slice(index + 1).trim());
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const missing = required.filter((name) => {
  const value = process.env[name];
  return !value || !value.trim();
});

if (missing.length > 0) {
  console.error('Missing required environment variables for rls-sanity:');
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '');
const anonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function probe(path, label) {
  const url = `${supabaseUrl}/rest/v1/${path}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: 'application/json',
      },
    });

    const text = await response.text();
    let data = null;
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = null;
      }
    }

    const rows = Array.isArray(data) ? data.length : 0;
    return {
      label,
      url,
      ok: response.ok,
      status: response.status,
      rows,
      text: trimmed.slice(0, 160),
      leaked: response.ok && rows > 0,
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      status: 0,
      rows: 0,
      text: String(error?.message || 'fetch failed'),
      leaked: false,
      fetchError: true,
    };
  }
}

const probes = [
  { path: 'study_rooms?select=id&limit=1', label: 'study_rooms' },
  { path: 'study_room_players?select=id&limit=1', label: 'study_room_players' },
  { path: 'study_room_state?select=room_id&limit=1', label: 'study_room_state' },
  { path: 'questions?select=id&limit=1', label: 'questions (anon check)' },
];

const results = [];
for (const item of probes) {
  // eslint-disable-next-line no-await-in-loop
  const result = await probe(item.path, item.label);
  results.push(result);
}

let hasLeak = false;
let hasUnexpected = false;

console.log('RLS sanity report (anon read-only):');
for (const result of results) {
  const statusLine = `${result.label} status=${result.status} rows=${result.rows}`;
  if (result.leaked) {
    hasLeak = true;
    console.error(`LEAK: ${statusLine}`);
  } else {
    console.log(`OK: ${statusLine}`);
  }

  if (!(result.status === 200 || result.status === 401 || result.status === 403)) {
    hasUnexpected = true;
    console.error(`UNEXPECTED STATUS: ${result.label} status=${result.status}`);
  }

  if (result.text) {
    console.log(`  snippet=${result.text}`);
  }
}

if (hasLeak) {
  console.error('RLS sanity failed: anon key was able to read protected data rows.');
  process.exit(1);
}

if (hasUnexpected) {
  console.error('RLS sanity failed: unexpected HTTP status returned by one or more probes.');
  process.exit(1);
}

console.log('RLS sanity checks passed.');
