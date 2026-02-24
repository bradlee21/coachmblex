import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function ymd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadAllQuestions(supabase, packIds) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = supabase.from('questions').select('*').range(from, from + pageSize - 1);
    if (Array.isArray(packIds) && packIds.length > 0) {
      query = query.in('pack_id', packIds);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message || 'Failed to export questions');
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const packIds = ['physiology-mid-term'];
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const rows = await loadAllQuestions(supabase, packIds);

  const outFile = resolve(process.cwd(), `docs/archive/questions-export-${ymd()}.json`);
  mkdirSync(dirname(outFile), { recursive: true });

  const payload = {
    exported_at: new Date().toISOString(),
    scope: { table: 'public.questions', pack_ids: packIds },
    row_count: rows.length,
    rows,
  };

  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`WROTE ${outFile}`);
  console.log(`Exported rows: ${rows.length}`);
  console.log(`Pack IDs: ${packIds.join(', ')}`);
}

await main();
