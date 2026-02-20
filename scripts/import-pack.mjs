import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 50;
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

function usageAndExit() {
  console.error('Usage: node scripts/import-pack.mjs <path-to-pack.json>');
  process.exit(1);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getDomainFromBlueprint(blueprintCode) {
  const root = String(blueprintCode || '').split('.')[0];
  return DOMAIN_BY_SECTION_CODE[root] || 'general';
}

function buildExplanation(question, fallbackAnswer = '') {
  return {
    answer: normalizeText(question.answer || fallbackAnswer),
    why: normalizeText(question.why),
    trap: normalizeText(question.trap),
    hook: normalizeText(question.hook),
  };
}

function validateAndMapQuestion(question, index) {
  const rowNo = index + 1;
  const errors = [];
  const blueprintCode = normalizeText(question?.blueprint_code);
  const questionType = normalizeText(question?.question_type).toLowerCase();
  const prompt = normalizeText(question?.prompt);

  if (!blueprintCode) errors.push('blueprint_code is required');
  if (!ALLOWED_TYPES.has(questionType)) {
    errors.push('question_type must be one of: mcq, reverse, fill');
  }
  if (!prompt) errors.push('prompt is required');

  const domain = normalizeText(question?.domain) || getDomainFromBlueprint(blueprintCode);
  const subtopic = normalizeText(question?.subtopic) || 'import';

  if (questionType === 'fill') {
    const correctText = normalizeText(question?.correct_text);
    if (!correctText) errors.push('correct_text is required for fill');

    if (errors.length > 0) {
      return { ok: false, rowNo, errors };
    }

    const choices = [correctText, '', '', ''];
    const explanation = buildExplanation(question, correctText);
    return {
      ok: true,
      rowNo,
      row: {
        domain,
        subtopic,
        blueprint_code: blueprintCode,
        question_type: 'fill',
        prompt,
        choices,
        correct_index: 0,
        explanation,
        difficulty: normalizeText(question?.difficulty) || 'medium',
      },
    };
  }

  const choicesObj = question?.choices;
  if (!choicesObj || typeof choicesObj !== 'object' || Array.isArray(choicesObj)) {
    errors.push('choices object with keys A/B/C/D is required for mcq/reverse');
  }

  const correctChoice = normalizeText(question?.correct_choice).toUpperCase();
  if (!CHOICE_KEYS.includes(correctChoice)) {
    errors.push('correct_choice must be one of A/B/C/D for mcq/reverse');
  }

  const orderedChoices = CHOICE_KEYS.map((key) =>
    normalizeText(choicesObj && typeof choicesObj === 'object' ? choicesObj[key] : '')
  );
  orderedChoices.forEach((choice, idx) => {
    if (!choice) {
      errors.push(`choices.${CHOICE_KEYS[idx]} is required for mcq/reverse`);
    }
  });

  if (errors.length > 0) {
    return { ok: false, rowNo, errors };
  }

  const correctIndex = CHOICE_KEYS.indexOf(correctChoice);
  const explanation = buildExplanation(question, orderedChoices[correctIndex] || '');

  return {
    ok: true,
    rowNo,
    row: {
      domain,
      subtopic,
      blueprint_code: blueprintCode,
      question_type: questionType,
      prompt,
      choices: orderedChoices,
      correct_index: correctIndex,
      explanation,
      difficulty: normalizeText(question?.difficulty) || 'medium',
    },
  };
}

async function insertBatch(supabase, rows, rowNumbers, failures) {
  if (rows.length === 0) return 0;

  const { data, error } = await supabase
    .from('questions')
    .insert(rows)
    .select('id');

  if (!error) {
    return Array.isArray(data) ? data.length : rows.length;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const { error: rowError } = await supabase.from('questions').insert(rows[i]);
    if (rowError) {
      failures.push({
        rowNo: rowNumbers[i],
        reasons: [`insert failed: ${rowError.message}`],
      });
      continue;
    }
    inserted += 1;
  }

  return inserted;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  const packPathArg = process.argv[2];
  if (!packPathArg) usageAndExit();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing env vars. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), packPathArg);
  let pack;
  try {
    const raw = readFileSync(filePath, 'utf8');
    pack = JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read/parse pack JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    console.error('Pack must be a JSON object.');
    process.exit(1);
  }

  if (!Array.isArray(pack.questions)) {
    console.error('Pack must include questions[] array.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const failures = [];
  const validRows = [];
  const validRowNumbers = [];

  for (let i = 0; i < pack.questions.length; i += 1) {
    const result = validateAndMapQuestion(pack.questions[i], i);
    if (!result.ok) {
      failures.push({ rowNo: result.rowNo, reasons: result.errors });
      continue;
    }
    validRows.push(result.row);
    validRowNumbers.push(result.rowNo);
  }

  let insertedCount = 0;
  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, validRows.length);
    const batchRows = validRows.slice(start, end);
    const batchNumbers = validRowNumbers.slice(start, end);
    const inserted = await insertBatch(supabase, batchRows, batchNumbers, failures);
    insertedCount += inserted;
  }

  const invalidCount = failures.length;
  console.log(`Pack: ${normalizeText(pack.packId) || '(no packId)'}`);
  console.log(`Source: ${normalizeText(pack.source) || '(no source)'}`);
  console.log(`Total rows: ${pack.questions.length}`);
  console.log(`Inserted: ${insertedCount}`);
  console.log(`Skipped/invalid: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log('Invalid rows:');
    for (const failure of failures) {
      console.log(`- row ${failure.rowNo}: ${failure.reasons.join('; ')}`);
    }
  }
}

await main();
