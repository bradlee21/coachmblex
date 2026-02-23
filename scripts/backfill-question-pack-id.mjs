import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const FETCH_PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;
const CHOICE_KEYS = ['A', 'B', 'C', 'D'];

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

function usageAndExit(exitCode = 0) {
  console.log('Usage: node scripts/backfill-question-pack-id.mjs [--apply]');
  console.log('  Default is dry-run. Use --apply to write updates to Supabase.');
  process.exit(exitCode);
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSignatureText(value) {
  return normalizeText(value).toLowerCase();
}

function parseMaybeObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolvePackId(pack, filePath) {
  return (
    normalizeText(pack?.pack_id) ||
    normalizeText(pack?.packId) ||
    normalizeText(pack?.id) ||
    normalizeText(pack?.meta?.id) ||
    normalizeText(filePath ? basename(filePath, '.json') : '')
  );
}

function buildExplanationFromPack(question, fallbackAnswer = '') {
  const nestedExplanation =
    question?.explanation && typeof question.explanation === 'object' && !Array.isArray(question.explanation)
      ? question.explanation
      : {};

  return {
    answer: normalizeText(question?.answer || nestedExplanation?.answer || fallbackAnswer),
    why: normalizeText(question?.why || nestedExplanation?.why || question?.explanation_why),
    trap: normalizeText(question?.trap || nestedExplanation?.trap || question?.explanation_trap),
    hook: normalizeText(question?.hook || nestedExplanation?.hook || question?.explanation_hook),
  };
}

function mapPackQuestionToImportedShape(question) {
  const blueprintCode = normalizeText(question?.blueprint_code);
  const questionType = normalizeText(question?.question_type || question?.type).toLowerCase();
  const prompt = normalizeText(question?.prompt);
  if (!blueprintCode || !questionType || !prompt) return null;

  if (questionType === 'fill' || questionType === 'fib') {
    const correctText =
      normalizeText(question?.correct_text) ||
      normalizeText(question?.correct?.text) ||
      normalizeText(question?.correctText);
    if (!correctText) return null;
    return {
      blueprint_code: blueprintCode,
      question_type: 'fill',
      prompt,
      choices: [correctText, '', '', ''],
      correct_index: 0,
      explanation: buildExplanationFromPack(question, correctText),
    };
  }

  if (questionType === 'mcq' || questionType === 'reverse') {
    let orderedChoices = [];
    if (Array.isArray(question?.choices)) {
      orderedChoices = question.choices.map((choice) => normalizeText(choice));
    } else if (question?.choices && typeof question.choices === 'object') {
      orderedChoices = CHOICE_KEYS.map((key) => normalizeText(question.choices[key]));
    }
    if (orderedChoices.length < 4) return null;
    orderedChoices = orderedChoices.slice(0, 4);
    if (orderedChoices.some((choice) => !choice)) return null;

    let correctIndex = null;
    if (typeof question?.correct_choice === 'string') {
      const correctChoice = normalizeText(question.correct_choice).toUpperCase();
      correctIndex = CHOICE_KEYS.indexOf(correctChoice);
    } else if (Number.isInteger(question?.correct?.index) || typeof question?.correct?.index === 'number') {
      const parsed = Number(question.correct.index);
      correctIndex = Number.isInteger(parsed) ? parsed : null;
    } else if (typeof question?.correct_index === 'number') {
      correctIndex = Number.isInteger(question.correct_index) ? question.correct_index : null;
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= orderedChoices.length) {
      return null;
    }

    return {
      blueprint_code: blueprintCode,
      question_type: questionType,
      prompt,
      choices: orderedChoices,
      correct_index: correctIndex,
      explanation: buildExplanationFromPack(question, orderedChoices[correctIndex] || ''),
    };
  }

  return null;
}

function getQuestionSignature(question) {
  return JSON.stringify({
    question_type: normalizeSignatureText(question?.question_type),
    blueprint_code: normalizeSignatureText(question?.blueprint_code),
    prompt: normalizeSignatureText(question?.prompt),
    choices: Array.isArray(question?.choices)
      ? question.choices.map((choice) => normalizeSignatureText(choice))
      : [],
    correct_index:
      Number.isInteger(question?.correct_index) || typeof question?.correct_index === 'number'
        ? Number(question.correct_index)
        : null,
    explanation: {
      answer: normalizeSignatureText(question?.explanation?.answer),
      why: normalizeSignatureText(question?.explanation?.why),
      trap: normalizeSignatureText(question?.explanation?.trap),
      hook: normalizeSignatureText(question?.explanation?.hook),
    },
  });
}

function getQuestionBaseSignature(question) {
  return JSON.stringify({
    question_type: normalizeSignatureText(question?.question_type),
    blueprint_code: normalizeSignatureText(question?.blueprint_code),
    prompt: normalizeSignatureText(question?.prompt),
    choices: Array.isArray(question?.choices)
      ? question.choices.map((choice) => normalizeSignatureText(choice))
      : [],
    correct_index:
      Number.isInteger(question?.correct_index) || typeof question?.correct_index === 'number'
        ? Number(question.correct_index)
        : null,
  });
}

function buildLocalPackSignatureIndex(packFiles) {
  const strictMap = new Map();
  const baseMap = new Map();
  const stats = {
    packsLoaded: 0,
    questionsIndexed: 0,
    invalidSkipped: 0,
  };

  for (const filePath of packFiles) {
    let pack;
    try {
      pack = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!pack || typeof pack !== 'object' || !Array.isArray(pack.questions)) continue;
    const packId = resolvePackId(pack, filePath);
    if (!packId) continue;

    stats.packsLoaded += 1;
    for (const question of pack.questions) {
      const mapped = mapPackQuestionToImportedShape(question);
      if (!mapped) {
        stats.invalidSkipped += 1;
        continue;
      }
      stats.questionsIndexed += 1;
      const strictSignature = getQuestionSignature(mapped);
      const baseSignature = getQuestionBaseSignature(mapped);

      if (!strictMap.has(strictSignature)) strictMap.set(strictSignature, new Set());
      strictMap.get(strictSignature).add(packId);

      if (!baseMap.has(baseSignature)) baseMap.set(baseSignature, new Set());
      baseMap.get(baseSignature).add(packId);
    }
  }

  return { strictMap, baseMap, stats };
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

async function verifyPackIdColumnExists(supabase) {
  const { error } = await supabase.from('questions').select('pack_id').limit(1);
  if (error) {
    throw new Error(
      `questions.pack_id column is not available (${error.message}). Run docs/sql/run-these-queries/2026-02-23-questions-pack-id.sql first.`
    );
  }
}

async function fetchQuestionsMissingPackId(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;
    let query = supabase
      .from('questions')
      .select(
        'id,question_type,blueprint_code,prompt,choices,correct_index,explanation,pack_id'
      )
      .or('pack_id.is.null,pack_id.eq.')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    const { data, error } = await query;

    if (error) {
      throw new Error(error.message || 'Failed to fetch questions needing pack_id backfill');
    }
    if (!Array.isArray(data) || data.length === 0) break;

    rows.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return rows;
}

function addToGroupedIds(map, packId, id) {
  if (!map.has(packId)) map.set(packId, []);
  map.get(packId).push(id);
}

function resolveUniquePackId(setValue) {
  if (!(setValue instanceof Set)) return '';
  return setValue.size === 1 ? Array.from(setValue)[0] : '';
}

async function applyUpdates(supabase, groupedIdsByPack) {
  let updated = 0;

  for (const [packId, ids] of groupedIdsByPack.entries()) {
    for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
      const batch = ids.slice(i, i + UPDATE_BATCH_SIZE);
      const { error } = await supabase.from('questions').update({ pack_id: packId }).in('id', batch);
      if (error) {
        throw new Error(`Failed updating pack_id=${packId}: ${error.message}`);
      }
      updated += batch.length;
    }
  }

  return updated;
}

function getPackFiles() {
  const packsDir = resolve(process.cwd(), 'src/content/packs');
  let entries = [];
  try {
    entries = readdirSync(packsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== '.gitkeep')
    .map((entry) => resolve(packsDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) usageAndExit(0);
  const shouldApply = args.includes('--apply');

  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing env vars. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }

  const packFiles = getPackFiles();
  if (packFiles.length === 0) {
    console.error('No local pack files found in src/content/packs.');
    process.exit(1);
  }

  const localIndex = buildLocalPackSignatureIndex(packFiles);
  console.log(`Backfill target Supabase hostname: ${getHostnameFromUrl(supabaseUrl)}`);
  console.log(`Mode: ${shouldApply ? 'APPLY' : 'DRY RUN'} (use --apply to write updates)`);
  console.log(`Local packs indexed: ${localIndex.stats.packsLoaded}`);
  console.log(`Local questions indexed: ${localIndex.stats.questionsIndexed}`);
  if (localIndex.stats.invalidSkipped > 0) {
    console.log(`Local questions skipped (unmappable): ${localIndex.stats.invalidSkipped}`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  await verifyPackIdColumnExists(supabase);

  const dbRows = await fetchQuestionsMissingPackId(supabase);
  console.log(`Questions needing pack_id backfill: ${dbRows.length}`);
  if (dbRows.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const groupedIdsByPack = new Map();
  let strictMatched = 0;
  let baseMatched = 0;
  let ambiguousStrict = 0;
  let ambiguousBase = 0;
  let unmatched = 0;

  for (const row of dbRows) {
    const strictSignature = getQuestionSignature(row);
    const baseSignature = getQuestionBaseSignature(row);
    const strictPackId = resolveUniquePackId(localIndex.strictMap.get(strictSignature));
    if (strictPackId) {
      addToGroupedIds(groupedIdsByPack, strictPackId, row.id);
      strictMatched += 1;
      continue;
    }
    if (localIndex.strictMap.has(strictSignature)) {
      ambiguousStrict += 1;
    }

    const basePackId = resolveUniquePackId(localIndex.baseMap.get(baseSignature));
    if (basePackId) {
      addToGroupedIds(groupedIdsByPack, basePackId, row.id);
      baseMatched += 1;
      continue;
    }
    if (localIndex.baseMap.has(baseSignature)) {
      ambiguousBase += 1;
      continue;
    }
    unmatched += 1;
  }

  let toUpdateCount = 0;
  for (const ids of groupedIdsByPack.values()) {
    toUpdateCount += ids.length;
  }

  console.log(`Strict matches: ${strictMatched}`);
  console.log(`Base-signature matches: ${baseMatched}`);
  console.log(`Ambiguous strict matches (skipped): ${ambiguousStrict}`);
  console.log(`Ambiguous base matches (skipped): ${ambiguousBase}`);
  console.log(`Unmatched (skipped): ${unmatched}`);
  console.log(`Rows ready to update: ${toUpdateCount}`);

  if (toUpdateCount === 0) {
    console.log('No rows can be backfilled from local packs.');
    return;
  }

  const preview = Array.from(groupedIdsByPack.entries())
    .map(([packId, ids]) => ({ packId, count: ids.length }))
    .sort((a, b) => b.count - a.count || a.packId.localeCompare(b.packId))
    .slice(0, 10);
  console.log('Top pack_id assignments (preview):');
  for (const item of preview) {
    console.log(`- ${item.packId}: ${item.count}`);
  }

  if (!shouldApply) {
    console.log('Dry run complete. Re-run with --apply to write questions.pack_id updates.');
    return;
  }

  const updated = await applyUpdates(supabase, groupedIdsByPack);
  console.log(`Updated rows: ${updated}`);
}

await main();
