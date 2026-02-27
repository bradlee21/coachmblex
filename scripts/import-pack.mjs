import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { validateQuestion } from './lib/questionSanityCheck.mjs';

const BATCH_SIZE = 50;
const SANITY_REPORT_LIMIT = 10;
const ALLOWED_TYPES = new Set(['mcq', 'reverse', 'fill']);
const CHOICE_KEYS = ['A', 'B', 'C', 'D'];
const ALLOWED_DOMAIN_CODES = new Set(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
const DOMAIN_BY_SECTION_CODE = {
  '1': 'anatomy',
  '2': 'kinesiology',
  '3': 'pathology',
  '4': 'benefits-effects',
  '5': 'assessment',
  '6': 'ethics',
  '7': 'practice',
};
const DOMAIN_BY_DOMAIN_CODE = {
  D1: 'anatomy',
  D2: 'kinesiology',
  D3: 'pathology',
  D4: 'benefits-effects',
  D5: 'assessment',
  D6: 'ethics',
  D7: 'practice',
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
  console.error('Usage: node scripts/import-pack.mjs [--strict-sanity] <path-to-pack.json>');
  process.exit(1);
}

function parseCliArgs(argv) {
  let packPathArg = '';
  let strictSanity = false;

  for (const arg of argv) {
    if (arg === '--strict-sanity') {
      strictSanity = true;
      continue;
    }
    if (arg.startsWith('--')) {
      usageAndExit();
    }
    if (!packPathArg) {
      packPathArg = arg;
      continue;
    }
    usageAndExit();
  }

  return { packPathArg, strictSanity };
}

function getIssueCountEntries(issueCountByType) {
  return [...issueCountByType.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function getExampleValue(value, fallback = '(none)') {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function toPromptPreview(prompt) {
  const normalized = normalizeText(prompt);
  if (normalized.length <= 140) return normalized || '(none)';
  return `${normalized.slice(0, 137)}...`;
}

function buildSanityFlag(question, rowNo, packId, issues) {
  return {
    rowNo,
    rowId: getExampleValue(question?.id),
    prompt: toPromptPreview(question?.prompt),
    correctChoice: getExampleValue(question?.correct_choice),
    answer: getExampleValue(question?.answer || question?.correct_text || question?.explanation?.answer),
    packId,
    issues,
  };
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

function normalizeDomainCode(value) {
  const normalized = normalizeText(value).toUpperCase();
  return ALLOWED_DOMAIN_CODES.has(normalized) ? normalized : '';
}

function getDomainCodeFromBlueprint(blueprintCode) {
  const root = normalizeText(blueprintCode).toUpperCase().split('.')[0];
  if (/^[1-7]$/.test(root)) return `D${root}`;
  const domainMatch = root.match(/^D([1-7])$/);
  if (domainMatch) return `D${domainMatch[1]}`;
  return '';
}

function getCanonicalDomainCode(question) {
  return (
    normalizeDomainCode(question?.domain_code || question?.domainCode) ||
    getDomainCodeFromBlueprint(question?.blueprint_code)
  );
}

function getQuestionSignature(question) {
  return JSON.stringify({
    question_type: normalizeSignatureText(question?.question_type),
    domain_code: normalizeSignatureText(getCanonicalDomainCode(question)),
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
    domain_code: normalizeSignatureText(getCanonicalDomainCode(question)),
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
  const byStrictSignature = new Map();
  const byBaseSignature = new Map();
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id,pack_id,domain,subtopic,question_type,domain_code,blueprint_code,prompt,choices,correct_index,explanation,difficulty'
      )
      .range(from, to);

    if (error) {
      throw new Error(error.message || 'Failed to load existing questions');
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const strictSignature = getQuestionSignature(row);
      signatures.add(strictSignature);
      if (!byStrictSignature.has(strictSignature)) {
        byStrictSignature.set(strictSignature, row);
      }
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

  return { signatures, byStrictSignature, byBaseSignature };
}

function getDomainFromBlueprint(blueprintCode) {
  const root = String(blueprintCode || '').split('.')[0];
  return DOMAIN_BY_SECTION_CODE[root] || 'general';
}

function getDomainFromDomainCode(domainCode) {
  return DOMAIN_BY_DOMAIN_CODE[String(domainCode || '').toUpperCase()] || 'general';
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

function resolvePackId(pack) {
  return (
    normalizeText(pack?.pack_id) ||
    normalizeText(pack?.packId) ||
    normalizeText(pack?.meta?.id)
  );
}

function validateAndMapQuestion(question, index, packId) {
  const rowNo = index + 1;
  const errors = [];
  const blueprintCode = normalizeText(question?.blueprint_code);
  const rawDomainCode = normalizeText(question?.domain_code || question?.domainCode);
  const normalizedDomainCode = normalizeDomainCode(rawDomainCode);
  const mappedDomainCode = normalizedDomainCode || getDomainCodeFromBlueprint(blueprintCode);
  const questionType = normalizeText(question?.question_type).toLowerCase();
  const prompt = normalizeText(question?.prompt);

  if (rawDomainCode && !normalizedDomainCode) {
    errors.push('domain_code must be one of D1..D7');
  }
  if (!mappedDomainCode) {
    errors.push('domain_code is required (or provide legacy blueprint_code mappable to D1..D7)');
  }
  if (!ALLOWED_TYPES.has(questionType)) {
    errors.push('question_type must be one of: mcq, reverse, fill');
  }
  if (!prompt) errors.push('prompt is required');

  const domain =
    normalizeText(question?.domain) ||
    getDomainFromDomainCode(mappedDomainCode) ||
    getDomainFromBlueprint(blueprintCode);
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
        pack_id: packId,
        domain,
        domain_code: mappedDomainCode,
        subtopic,
        ...(blueprintCode ? { blueprint_code: blueprintCode } : {}),
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
      pack_id: packId,
      domain,
      domain_code: mappedDomainCode,
      subtopic,
      ...(blueprintCode ? { blueprint_code: blueprintCode } : {}),
      question_type: questionType,
      prompt,
      choices: orderedChoices,
      correct_index: correctIndex,
      explanation,
      difficulty: normalizeText(question?.difficulty) || 'medium',
    },
  };
}

async function insertBatch(supabase, rows, rowNumbers, writeFailures, stats) {
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
        continue;
      }
      writeFailures.push({
        rowNo: rowNumbers[i],
        reasons: [`insert failed: ${rowError.message}`],
      });
      continue;
    }
    inserted += 1;
  }

  return inserted;
}

async function updateBatch(supabase, updates, writeFailures, stats) {
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
        continue;
      }
      writeFailures.push({
        rowNo: item.rowNo,
        reasons: [`update failed: ${error.message}`],
      });
      continue;
    }

    updated += 1;
  }

  return updated;
}

function canTagExistingDuplicate(existingRow, incomingPackId) {
  return Boolean(
    existingRow?.id &&
      normalizeText(incomingPackId) &&
      !normalizeText(existingRow?.pack_id)
  );
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));

  const { packPathArg, strictSanity } = parseCliArgs(process.argv.slice(2));
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

  const canonicalPackId = resolvePackId(pack);
  if (!canonicalPackId) {
    console.error('Pack must include a pack-level pack_id, packId, or meta.id.');
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

  const validationFailures = [];
  const writeFailures = [];
  const sanityFlags = [];
  const sanityIssueCounts = new Map();
  const rowsToInsert = [];
  const rowNumbersToInsert = [];
  const rowsToUpdate = [];
  const rowsToTag = [];
  const processedBaseSignatures = new Set();
  const taggedExistingIds = new Set();
  const stats = {
    duplicateSkippedCount: 0,
    sanityStrictSkippedCount: 0,
  };
  let seenSignatures = new Set();
  let existingRowsByStrict = new Map();
  let existingRowsByBase = new Map();

  try {
    const existingIndex = await loadExistingQuestionIndex(supabase);
    seenSignatures = existingIndex.signatures;
    existingRowsByStrict = existingIndex.byStrictSignature;
    existingRowsByBase = existingIndex.byBaseSignature;
    console.log(`Existing strict signatures loaded: ${seenSignatures.size}`);
  } catch (error) {
    console.log(
      `Existing strict signature pre-check unavailable (${error instanceof Error ? error.message : String(error)}). Continuing without dedupe guard.`
    );
  }

  for (let i = 0; i < pack.questions.length; i += 1) {
    const incomingQuestion = pack.questions[i];
    const sanity = validateQuestion(incomingQuestion);
    if (!sanity.ok) {
      const sanityFlag = buildSanityFlag(incomingQuestion, i + 1, canonicalPackId, sanity.issues);
      sanityFlags.push(sanityFlag);
      for (const issue of sanity.issues) {
        sanityIssueCounts.set(issue, Number(sanityIssueCounts.get(issue) || 0) + 1);
      }
      if (strictSanity) {
        stats.sanityStrictSkippedCount += 1;
        continue;
      }
    }

    const result = validateAndMapQuestion(incomingQuestion, i, canonicalPackId);
    if (!result.ok) {
      validationFailures.push({ rowNo: result.rowNo, reasons: result.errors });
      continue;
    }

    const signature = getQuestionSignature(result.row);
    if (seenSignatures.has(signature)) {
      const existingStrictRow = existingRowsByStrict.get(signature);
      if (
        canTagExistingDuplicate(existingStrictRow, canonicalPackId) &&
        !taggedExistingIds.has(existingStrictRow.id)
      ) {
        rowsToTag.push({
          id: existingStrictRow.id,
          rowNo: result.rowNo,
          row: { pack_id: canonicalPackId },
        });
        taggedExistingIds.add(existingStrictRow.id);
      }
      stats.duplicateSkippedCount += 1;
      continue;
    }

    const baseSignature = getQuestionBaseSignature(result.row);
    const existingCandidates = existingRowsByBase.get(baseSignature) || [];
    if (existingCandidates.length > 0) {
      if (processedBaseSignatures.has(baseSignature)) {
        stats.duplicateSkippedCount += 1;
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
  let taggedCount = 0;
  updatedCount = await updateBatch(
    supabase,
    rowsToUpdate,
    writeFailures,
    stats
  );
  taggedCount = await updateBatch(
    supabase,
    rowsToTag,
    writeFailures,
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
      writeFailures,
      stats
    );
    insertedCount += inserted;
  }

  const invalidCount = validationFailures.length;
  const sanityFlaggedCount = sanityFlags.length;
  const writeFailureCount = writeFailures.length;
  console.log(`Pack: ${canonicalPackId}`);
  console.log(`Source: ${normalizeText(pack.source) || '(no source)'}`);
  console.log(`Sanity strict mode: ${strictSanity ? 'on' : 'off'}`);
  console.log(`Total rows: ${pack.questions.length}`);
  console.log(`Sanity flagged: ${sanityFlaggedCount}`);
  if (strictSanity) {
    console.log(`Sanity strict skipped: ${stats.sanityStrictSkippedCount}`);
  }
  console.log(`Updated: ${updatedCount}`);
  console.log(`Tagged: ${taggedCount}`);
  console.log(`Inserted: ${insertedCount}`);
  console.log(`Skipped duplicates: ${stats.duplicateSkippedCount}`);
  console.log(`Skipped/invalid: ${invalidCount}`);
  if (writeFailureCount > 0) {
    console.log(`Failed writes: ${writeFailureCount}`);
  }
  try {
    const afterCount = await getQuestionCount(supabase);
    console.log(`Questions in DB after import: ${afterCount}`);
  } catch (error) {
    console.log(
      `Questions in DB after import: unavailable (${error instanceof Error ? error.message : String(error)})`
    );
  }

  if (sanityFlaggedCount > 0) {
    console.log('Sanity issues (top types):');
    for (const [issue, count] of getIssueCountEntries(sanityIssueCounts)) {
      console.log(`- ${issue}: ${count}`);
    }
    console.log(`Sanity flagged examples (first ${Math.min(SANITY_REPORT_LIMIT, sanityFlaggedCount)}):`);
    for (const flag of sanityFlags.slice(0, SANITY_REPORT_LIMIT)) {
      console.log(
        `- row ${flag.rowNo} | id: ${flag.rowId} | pack: ${flag.packId} | correct: ${flag.correctChoice} | answer: ${flag.answer} | prompt: ${flag.prompt} | issues: ${flag.issues.join(', ')}`
      );
    }
  }

  if (invalidCount > 0) {
    console.log('Invalid rows:');
    for (const failure of validationFailures) {
      console.log(`- row ${failure.rowNo}: ${failure.reasons.join('; ')}`);
    }
  }
  if (writeFailureCount > 0) {
    console.log('Write failures:');
    for (const failure of writeFailures) {
      console.log(`- row ${failure.rowNo}: ${failure.reasons.join('; ')}`);
    }
  }
}

await main();
