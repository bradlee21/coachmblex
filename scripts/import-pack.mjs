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

async function getQuestionCount(supabase) {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message || 'Unknown count error');
  }

  return Number(count || 0);
}

function isUniqueViolation(error) {
  if (!error) return false;
  const code = normalizeText(error.code);
  const message = normalizeText(error.message);
  const details = normalizeText(error.details);
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    details.includes('already exists')
  );
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSignatureText(value) {
  return normalizeText(value).toLowerCase();
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

function getExplanationCoverageScore(question) {
  const explanation = question?.explanation || {};
  let score = 0;
  if (normalizeText(explanation.answer)) score += 1;
  if (normalizeText(explanation.why)) score += 1;
  if (normalizeText(explanation.trap)) score += 1;
  if (normalizeText(explanation.hook)) score += 1;
  return score;
}

function pickUpdateTargetByBaseSignature(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  let selected = candidates[0];
  let selectedScore = getExplanationCoverageScore(selected);
  for (const row of candidates.slice(1)) {
    const rowScore = getExplanationCoverageScore(row);
    if (rowScore < selectedScore) {
      selected = row;
      selectedScore = rowScore;
    }
  }
  return selected;
}

async function loadExistingQuestionIndex(supabase) {
  const signatures = new Set();
  const byBaseSignature = new Map();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id,domain,subtopic,question_type,blueprint_code,prompt,choices,correct_index,explanation,difficulty'
      )
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Failed to load existing questions');
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      signatures.add(getQuestionSignature(row));
      const baseSignature = getQuestionBaseSignature(row);
      const existing = byBaseSignature.get(baseSignature) || [];
      existing.push(row);
      byBaseSignature.set(baseSignature, existing);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return { signatures, byBaseSignature };
}

function getDomainFromBlueprint(blueprintCode) {
  const root = String(blueprintCode || '').split('.')[0];
  return DOMAIN_BY_SECTION_CODE[root] || 'general';
}

function buildExplanation(question, fallbackAnswer = '') {
  const nestedExplanation =
    question?.explanation && typeof question.explanation === 'object'
      ? question.explanation
      : {};
  return {
    answer: normalizeText(question.answer || nestedExplanation.answer || fallbackAnswer),
    why: normalizeText(question.why || nestedExplanation.why || question.explanation_why),
    trap: normalizeText(question.trap || nestedExplanation.trap || question.explanation_trap),
    hook: normalizeText(question.hook || nestedExplanation.hook || question.explanation_hook),
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

async function insertBatch(supabase, rows, rowNumbers, failures, stats) {
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
      if (isUniqueViolation(rowError)) {
        stats.duplicateSkippedCount += 1;
        failures.push({
          rowNo: rowNumbers[i],
          reasons: ['duplicate question blocked by DB unique guard'],
        });
        continue;
      }
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

async function updateBatch(supabase, updates, failures, stats) {
  if (updates.length === 0) return 0;
  let updated = 0;

  for (const item of updates) {
    const { error } = await supabase
      .from('questions')
      .update(item.row)
      .eq('id', item.id);

    if (error) {
      if (isUniqueViolation(error)) {
        stats.duplicateSkippedCount += 1;
        failures.push({
          rowNo: item.rowNo,
          reasons: ['duplicate question blocked by DB unique guard on update'],
        });
        continue;
      }
      failures.push({
        rowNo: item.rowNo,
        reasons: [`update failed: ${error.message}`],
      });
      continue;
    }

    updated += 1;
  }

  return updated;
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

  const hostname = getHostnameFromUrl(supabaseUrl);
  console.log(`Import target Supabase hostname: ${hostname}`);
  let beforeCount = 0;
  try {
    beforeCount = await getQuestionCount(supabase);
    console.log(`Questions in DB before import: ${beforeCount}`);
  } catch (error) {
    console.log(
      `Questions in DB before import: unavailable (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const failures = [];
  const rowsToInsert = [];
  const rowNumbersToInsert = [];
  const rowsToUpdate = [];
  const processedBaseSignatures = new Set();
  const stats = {
    duplicateSkippedCount: 0,
  };
  let seenSignatures = new Set();
  let existingRowsByBase = new Map();

  try {
    const existingIndex = await loadExistingQuestionIndex(supabase);
    seenSignatures = existingIndex.signatures;
    existingRowsByBase = existingIndex.byBaseSignature;
    console.log(`Existing strict signatures loaded: ${seenSignatures.size}`);
  } catch (error) {
    console.log(
      `Existing strict signature pre-check unavailable (${error instanceof Error ? error.message : String(error)}). Continuing without dedupe guard.`
    );
  }

  for (let i = 0; i < pack.questions.length; i += 1) {
    const result = validateAndMapQuestion(pack.questions[i], i);
    if (!result.ok) {
      failures.push({ rowNo: result.rowNo, reasons: result.errors });
      continue;
    }

    const signature = getQuestionSignature(result.row);
    if (seenSignatures.has(signature)) {
      stats.duplicateSkippedCount += 1;
      failures.push({
        rowNo: result.rowNo,
        reasons: ['duplicate question detected (strict signature)'],
      });
      continue;
    }

    const baseSignature = getQuestionBaseSignature(result.row);
    const existingCandidates = existingRowsByBase.get(baseSignature) || [];
    if (existingCandidates.length > 0) {
      if (processedBaseSignatures.has(baseSignature)) {
        stats.duplicateSkippedCount += 1;
        failures.push({
          rowNo: result.rowNo,
          reasons: ['duplicate question detected (base signature)'],
        });
        continue;
      }

      const target = pickUpdateTargetByBaseSignature(existingCandidates);
      if (target?.id) {
        rowsToUpdate.push({
          id: target.id,
          rowNo: result.rowNo,
          row: result.row,
        });
        processedBaseSignatures.add(baseSignature);
        seenSignatures.add(signature);
        continue;
      }
    }

    seenSignatures.add(signature);
    rowsToInsert.push(result.row);
    rowNumbersToInsert.push(result.rowNo);
    existingRowsByBase.set(baseSignature, [result.row]);
  }

  let updatedCount = 0;
  updatedCount = await updateBatch(
    supabase,
    rowsToUpdate,
    failures,
    stats
  );

  let insertedCount = 0;
  for (let start = 0; start < rowsToInsert.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, rowsToInsert.length);
    const batchRows = rowsToInsert.slice(start, end);
    const batchNumbers = rowNumbersToInsert.slice(start, end);
    const inserted = await insertBatch(
      supabase,
      batchRows,
      batchNumbers,
      failures,
      stats
    );
    insertedCount += inserted;
  }

  const invalidCount = failures.length;
  console.log(`Pack: ${normalizeText(pack.packId) || '(no packId)'}`);
  console.log(`Source: ${normalizeText(pack.source) || '(no source)'}`);
  console.log(`Total rows: ${pack.questions.length}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Inserted: ${insertedCount}`);
  console.log(`Skipped duplicates: ${stats.duplicateSkippedCount}`);
  console.log(`Skipped/invalid: ${invalidCount}`);
  try {
    const afterCount = await getQuestionCount(supabase);
    console.log(`Questions in DB after import: ${afterCount}`);
  } catch (error) {
    console.log(
      `Questions in DB after import: unavailable (${error instanceof Error ? error.message : String(error)})`
    );
  }

  if (invalidCount > 0) {
    console.log('Invalid rows:');
    for (const failure of failures) {
      console.log(`- row ${failure.rowNo}: ${failure.reasons.join('; ')}`);
    }
  }
}

await main();
