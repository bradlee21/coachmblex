import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const FETCH_PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 200;

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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getQuestionSignature(question) {
  return JSON.stringify({
    question_type: normalizeText(question?.question_type),
    blueprint_code: normalizeText(question?.blueprint_code),
    prompt: normalizeText(question?.prompt),
    choices: Array.isArray(question?.choices)
      ? question.choices.map((choice) => normalizeText(choice))
      : [],
    correct_index:
      Number.isInteger(question?.correct_index) || typeof question?.correct_index === 'number'
        ? Number(question.correct_index)
        : null,
    explanation: {
      answer: normalizeText(question?.explanation?.answer),
      why: normalizeText(question?.explanation?.why),
      trap: normalizeText(question?.explanation?.trap),
      hook: normalizeText(question?.explanation?.hook),
    },
  });
}

async function getQuestionCount(supabase) {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true });

  if (error) throw new Error(error.message || 'Failed to count questions');
  return Number(count || 0);
}

async function fetchAllQuestions(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id, created_at, question_type, blueprint_code, prompt, choices, correct_index, explanation'
      )
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Failed to fetch questions');
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < FETCH_PAGE_SIZE) {
      break;
    }
    from += FETCH_PAGE_SIZE;
  }

  return rows;
}

async function deleteIds(supabase, ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await supabase.from('questions').delete().in('id', batch);
    if (error) {
      throw new Error(error.message || 'Failed to delete duplicate rows');
    }
    deleted += batch.length;
  }
  return deleted;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing env vars. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(`Dedupe target Supabase hostname: ${getHostnameFromUrl(supabaseUrl)}`);
  const beforeCount = await getQuestionCount(supabase);
  console.log(`Questions before dedupe: ${beforeCount}`);

  const rows = await fetchAllQuestions(supabase);
  const bySignature = new Map();

  for (const row of rows) {
    const signature = getQuestionSignature(row);
    if (!bySignature.has(signature)) {
      bySignature.set(signature, []);
    }
    bySignature.get(signature).push(row.id);
  }

  const toDelete = [];
  let duplicateGroups = 0;
  for (const ids of bySignature.values()) {
    if (ids.length <= 1) continue;
    duplicateGroups += 1;
    toDelete.push(...ids.slice(1));
  }

  console.log(`Duplicate groups found: ${duplicateGroups}`);
  console.log(`Duplicate rows to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('No duplicates found. Nothing deleted.');
    process.exit(0);
  }

  const deleted = await deleteIds(supabase, toDelete);
  const afterCount = await getQuestionCount(supabase);
  console.log(`Deleted rows: ${deleted}`);
  console.log(`Questions after dedupe: ${afterCount}`);
}

await main();
