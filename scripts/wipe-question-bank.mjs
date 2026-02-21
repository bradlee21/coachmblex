import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_HOSTNAME = 'qwspbrdnhkcxexysxwpf.supabase.co';
const REQUIRED_CONFIRM_ENV = 'WIPE_QUESTION_BANK';
const HOST_OVERRIDE_ENV = 'WIPE_OVERRIDE_HOST';

const CHILD_TABLES_IN_DELETE_ORDER = [
  'question_attempts',
  'attempts',
  'diagram_attempts',
  'study_sessions',
  'study_session_questions',
  'study_decks',
  'session_decks',
  'study_room_state',
];

function loadEnvFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? '';

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function getHostnameFromUrl(rawUrl) {
  try {
    const normalized = String(rawUrl || '').startsWith('http')
      ? String(rawUrl)
      : `https://${String(rawUrl || '')}`;
    return new URL(normalized).hostname || '(unknown)';
  } catch {
    return '(invalid-url)';
  }
}

function isMissingTableError(error) {
  const code = String(error?.code || '').trim();
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

async function getTableCount(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    if (isMissingTableError(error)) {
      return { table, exists: false, count: 0 };
    }
    throw new Error(`${table} count failed: ${error.message || 'unknown error'}`);
  }

  return { table, exists: true, count: Number(count || 0) };
}

async function deleteAllRows(supabase, table) {
  const { data: sampleRow, error: sampleError } = await supabase
    .from(table)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (sampleError) {
    if (isMissingTableError(sampleError)) {
      return { table, exists: false, deleted: false };
    }
    throw new Error(
      `${table} sample probe failed: ${sampleError.message || 'unknown error'}`
    );
  }

  if (!sampleRow || typeof sampleRow !== 'object') {
    return { table, exists: true, deleted: true };
  }

  const candidateColumns = ['id', 'room_id', 'session_id', 'question_id', 'user_id'];
  const probeColumn =
    candidateColumns.find((col) => Object.prototype.hasOwnProperty.call(sampleRow, col)) ||
    Object.keys(sampleRow)[0];

  if (!probeColumn) {
    return { table, exists: true, deleted: true };
  }

  const { error } = await supabase.from(table).delete().not(probeColumn, 'is', null);
  if (error) {
    if (isMissingTableError(error)) {
      return { table, exists: false, deleted: false };
    }
    throw new Error(`${table} delete failed: ${error.message || 'unknown error'}`);
  }
  return { table, exists: true, deleted: true };
}

function printCounts(label, counts) {
  console.log(label);
  for (const row of counts) {
    if (!row.exists) {
      console.log(`- ${row.table}: missing`);
      continue;
    }
    console.log(`- ${row.table}: ${row.count}`);
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  if (process.env[REQUIRED_CONFIRM_ENV] !== '1') {
    console.error(
      `Refusing to run. Set ${REQUIRED_CONFIRM_ENV}=1 to confirm wiping the question bank.`
    );
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing env vars. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }

  const hostname = getHostnameFromUrl(supabaseUrl);
  console.log(`Wipe target Supabase hostname: ${hostname}`);

  if (hostname !== EXPECTED_HOSTNAME && process.env[HOST_OVERRIDE_ENV] !== '1') {
    console.error(
      `Target host mismatch. Expected ${EXPECTED_HOSTNAME}. Set ${HOST_OVERRIDE_ENV}=1 to override.`
    );
    process.exit(1);
  }

  if (hostname !== EXPECTED_HOSTNAME && process.env[HOST_OVERRIDE_ENV] === '1') {
    console.log(
      `Host override enabled via ${HOST_OVERRIDE_ENV}=1; continuing on non-default host.`
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const trackedTables = [...CHILD_TABLES_IN_DELETE_ORDER, 'questions'];

  const beforeCounts = [];
  for (const table of trackedTables) {
    beforeCounts.push(await getTableCount(supabase, table));
  }
  printCounts('Counts before wipe:', beforeCounts);

  console.log('Deleting child/session/deck tables first...');
  for (const table of CHILD_TABLES_IN_DELETE_ORDER) {
    const existsInfo = beforeCounts.find((row) => row.table === table);
    if (!existsInfo?.exists) {
      console.log(`- ${table}: skipped (missing)`);
      continue;
    }
    await deleteAllRows(supabase, table);
    console.log(`- ${table}: deleted`);
  }

  const questionsExists = beforeCounts.find((row) => row.table === 'questions')?.exists;
  if (questionsExists) {
    await deleteAllRows(supabase, 'questions');
    console.log('- questions: deleted');
  } else {
    console.log('- questions: skipped (missing)');
  }

  const afterCounts = [];
  for (const table of trackedTables) {
    afterCounts.push(await getTableCount(supabase, table));
  }
  printCounts('Counts after wipe:', afterCounts);
}

await main();
