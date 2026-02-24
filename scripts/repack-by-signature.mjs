import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TARGET_PACK_ID = 'physiology-mid-term';
const LEGACY_PACK_ID = 'physiology-mid-term-legacy';
const PACK_FILE = 'src/content/packs/physiology-mid-term-v1.json';
const PAGE_SIZE = 1000;
const ALLOWED_TYPES = new Set(['mcq', 'reverse', 'fill']);
const CHOICE_KEYS = ['A', 'B', 'C', 'D'];
const DOMAIN_BY_SECTION_CODE = {
  '1': 'anatomy',
  '2': 'kinesiology',
  '3': 'pathology',
  '4': 'benefits-effects',
  '5': 'assessment',
  '6': 'ethics',
  '7': 'practice',
};

function loadEnvFile(filePath) {
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] == null) process.env[match[1]] = value;
  }
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
function normalizeSignatureText(value) {
  return normalizeText(value).toLowerCase();
}
function getQuestionSignature(question) {
  return JSON.stringify({
    question_type: normalizeSignatureText(question?.question_type),
    blueprint_code: normalizeSignatureText(question?.blueprint_code),
    prompt: normalizeSignatureText(question?.prompt),
    choices: Array.isArray(question?.choices) ? question.choices.map((c) => normalizeSignatureText(c)) : [],
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
function getDomainFromBlueprint(blueprintCode) {
  const root = String(blueprintCode || '').split('.')[0];
  return DOMAIN_BY_SECTION_CODE[root] || 'general';
}
function buildExplanation(question, fallbackAnswer = '') {
  const nested = question?.explanation && typeof question.explanation === 'object' ? question.explanation : {};
  return {
    answer: normalizeText(question.answer || nested.answer || fallbackAnswer),
    why: normalizeText(question.why || nested.why || question.explanation_why),
    trap: normalizeText(question.trap || nested.trap || question.explanation_trap),
    hook: normalizeText(question.hook || nested.hook || question.explanation_hook),
  };
}
function resolvePackId(pack) {
  return normalizeText(pack?.pack_id) || normalizeText(pack?.packId);
}
function validateAndMapQuestion(question, index, packId) {
  const rowNo = index + 1;
  const errors = [];
  const blueprintCode = normalizeText(question?.blueprint_code);
  const questionType = normalizeText(question?.question_type).toLowerCase();
  const prompt = normalizeText(question?.prompt);
  if (!blueprintCode) errors.push('blueprint_code is required');
  if (!ALLOWED_TYPES.has(questionType)) errors.push('question_type must be one of: mcq, reverse, fill');
  if (!prompt) errors.push('prompt is required');
  const domain = normalizeText(question?.domain) || getDomainFromBlueprint(blueprintCode);
  const subtopic = normalizeText(question?.subtopic) || 'import';

  if (questionType === 'fill') {
    const correctText = normalizeText(question?.correct_text);
    if (!correctText) errors.push('correct_text is required for fill');
    if (errors.length > 0) return { ok: false, rowNo, errors };
    const choices = [correctText, '', '', ''];
    return {
      ok: true,
      rowNo,
      row: {
        pack_id: packId,
        domain,
        subtopic,
        blueprint_code: blueprintCode,
        question_type: 'fill',
        prompt,
        choices,
        correct_index: 0,
        explanation: buildExplanation(question, correctText),
        difficulty: normalizeText(question?.difficulty) || 'medium',
      },
    };
  }

  const choicesObj = question?.choices;
  if (!choicesObj || typeof choicesObj !== 'object' || Array.isArray(choicesObj)) {
    errors.push('choices object with keys A/B/C/D is required for mcq/reverse');
  }
  const correctChoice = normalizeText(question?.correct_choice).toUpperCase();
  if (!CHOICE_KEYS.includes(correctChoice)) errors.push('correct_choice must be one of A/B/C/D for mcq/reverse');
  const orderedChoices = CHOICE_KEYS.map((k) => normalizeText(choicesObj && typeof choicesObj === 'object' ? choicesObj[k] : ''));
  orderedChoices.forEach((choice, idx) => { if (!choice) errors.push(`choices.${CHOICE_KEYS[idx]} is required for mcq/reverse`); });
  if (errors.length > 0) return { ok: false, rowNo, errors };
  const correctIndex = CHOICE_KEYS.indexOf(correctChoice);
  return {
    ok: true,
    rowNo,
    row: {
      pack_id: packId,
      domain,
      subtopic,
      blueprint_code: blueprintCode,
      question_type: questionType,
      prompt,
      choices: orderedChoices,
      correct_index: correctIndex,
      explanation: buildExplanation(question, orderedChoices[correctIndex] || ''),
      difficulty: normalizeText(question?.difficulty) || 'medium',
    },
  };
}

async function loadAllQuestions(supabase) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id,pack_id,question_type,blueprint_code,prompt,choices,correct_index,explanation,difficulty,domain,subtopic')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || 'Failed to load questions');
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function updatePackIds(supabase, ids, nextPackId) {
  if (!ids.length) return 0;
  let updated = 0;
  for (const id of ids) {
    const { error } = await supabase.from('questions').update({ pack_id: nextPackId }).eq('id', id);
    if (error) throw new Error(`Failed updating ${id}: ${error.message}`);
    updated += 1;
  }
  return updated;
}

function parseFlags() {
  const args = new Set(process.argv.slice(2));
  return { apply: args.has('--apply'), clean: args.has('--clean'), allowMulti: args.has('--allow-multi') };
}

async function main() {
  const { apply, clean, allowMulti } = parseFlags();
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const pack = JSON.parse(readFileSync(resolve(process.cwd(), PACK_FILE), 'utf8'));
  const packId = resolvePackId(pack);
  if (!packId) throw new Error('Curated pack missing packId/pack_id');

  const mapped = [];
  const validationFailures = [];
  for (let i = 0; i < (pack.questions || []).length; i += 1) {
    const result = validateAndMapQuestion(pack.questions[i], i, packId);
    if (!result.ok) validationFailures.push(result);
    else mapped.push({ rowNo: result.rowNo, row: result.row, source: pack.questions[i] });
  }
  if (validationFailures.length) {
    console.error('Pack validation failed for repack script');
    for (const f of validationFailures) console.error(`- row ${f.rowNo}: ${f.errors.join('; ')}`);
    process.exit(1);
  }

  const curatedSignatures = new Map();
  for (const item of mapped) {
    curatedSignatures.set(getQuestionSignature(item.row), item);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const allRows = await loadAllQuestions(supabase);
  const dbBySignature = new Map();
  for (const row of allRows) {
    const sig = getQuestionSignature(row);
    const list = dbBySignature.get(sig) || [];
    list.push(row);
    dbBySignature.set(sig, list);
  }

  const matchedRows = [];
  const missing = [];
  const multiMatches = [];
  for (const [sig, item] of curatedSignatures.entries()) {
    const matches = dbBySignature.get(sig) || [];
    if (matches.length === 0) {
      missing.push({ rowNo: item.rowNo, prompt: normalizeText(item.source?.prompt) });
      continue;
    }
    if (matches.length > 1) {
      multiMatches.push({
        signature: sig,
        rowNo: item.rowNo,
        prompt: normalizeText(item.source?.prompt),
        ids: matches.map((row) => row.id),
      });
    }
    for (const row of matches) matchedRows.push(row);
  }

  const curatedSigSet = new Set(curatedSignatures.keys());
  const activeRows = allRows.filter((row) => normalizeText(row.pack_id) === TARGET_PACK_ID);
  const activeRowsToLegacy = activeRows.filter((row) => !curatedSigSet.has(getQuestionSignature(row)));

  const matchedIds = [...new Set(matchedRows.map((r) => r.id))];
  const uniqueMatchCount = curatedSignatures.size - missing.length - multiMatches.length;
  const duplicatesFoundCount = multiMatches.length;
  const moveToTargetIds = [...new Set(matchedRows.filter((r) => normalizeText(r.pack_id) !== TARGET_PACK_ID).map((r) => r.id))];
  const moveToLegacyIds = [...new Set(activeRowsToLegacy.map((r) => r.id))];

  console.log(`Curated pack file: ${PACK_FILE}`);
  console.log(`Curated signatures: ${curatedSignatures.size}`);
  console.log(`duplicates_found: ${duplicatesFoundCount}`);
  console.log(`unique_matches: ${uniqueMatchCount}`);
  console.log(`multi_matches: ${multiMatches.length}`);
  console.log(`Matched rows (global strict signature): ${matchedIds.length}`);
  console.log(`Missing signatures: ${missing.length}`);
  console.log(`Matched row ids: ${matchedIds.join(', ') || '(none)'}`);
  if (multiMatches.length) {
    console.log('Ambiguous multi-match signatures:');
    for (const item of multiMatches) {
      console.log(`- row ${item.rowNo}: ${item.prompt}`);
      console.log(`  ids: ${item.ids.join(', ')}`);
      console.log(`  signature: ${item.signature}`);
    }
  }
  if (missing.length) {
    console.log('Missing prompts:');
    for (const m of missing) console.log(`- row ${m.rowNo}: ${m.prompt}`);
  }
  console.log('Planned changes (SQL-like):');
  console.log(`- set pack_id='${TARGET_PACK_ID}' for ${moveToTargetIds.length} matched row(s) not already in target pack`);
  if (clean) {
    console.log(`- set pack_id='${LEGACY_PACK_ID}' for ${moveToLegacyIds.length} active row(s) not in curated signature set`);
  }

  if (multiMatches.length && !allowMulti) {
    console.error('Refusing to continue: one or more curated signatures matched multiple rows. Re-run with --allow-multi to permit writes.');
    process.exit(1);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write changes.');
    return;
  }

  const movedToTarget = await updatePackIds(supabase, moveToTargetIds, TARGET_PACK_ID);
  let movedToLegacy = 0;
  if (clean) movedToLegacy = await updatePackIds(supabase, moveToLegacyIds, LEGACY_PACK_ID);

  console.log('Apply complete.');
  console.log(`Moved to ${TARGET_PACK_ID}: ${movedToTarget}`);
  if (clean) console.log(`Moved to ${LEGACY_PACK_ID}: ${movedToLegacy}`);
}

await main();
