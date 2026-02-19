import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const seedPath = resolve(process.cwd(), 'src/content/questions.seed.json');
const raw = readFileSync(seedPath, 'utf8');
const questions = JSON.parse(raw);

const missingBlueprint = questions.filter((question) => !question.blueprint_code);
if (missingBlueprint.length > 0) {
  console.error('Every seeded question must include blueprint_code.');
  process.exit(1);
}

const conceptRows = [];
const conceptSeen = new Set();

for (const question of questions) {
  if (!question.concept_label) continue;
  const key = `${question.domain}::${question.concept_label}`;
  if (conceptSeen.has(key)) continue;
  conceptSeen.add(key);
  conceptRows.push({ domain: question.domain, label: question.concept_label });
}

if (conceptRows.length > 0) {
  const { error: conceptUpsertError } = await supabase
    .from('concepts')
    .upsert(conceptRows, { onConflict: 'domain,label' });
  if (conceptUpsertError) {
    console.error('Failed to upsert concepts:', conceptUpsertError.message);
    process.exit(1);
  }
}

const { data: concepts, error: conceptsError } = await supabase
  .from('concepts')
  .select('id,domain,label');

if (conceptsError) {
  console.error('Failed to load concepts:', conceptsError.message);
  process.exit(1);
}

const conceptIdByKey = new Map(
  (concepts || []).map((row) => [`${row.domain}::${row.label}`, row.id])
);

const prompts = questions.map((question) => question.prompt);
if (prompts.length > 0) {
  const { error: deleteError } = await supabase
    .from('questions')
    .delete()
    .in('prompt', prompts);
  if (deleteError) {
    console.error('Failed to clean existing seeded questions:', deleteError.message);
    process.exit(1);
  }
}

const questionRows = questions.map((question) => ({
  domain: question.domain,
  subtopic: question.subtopic,
  blueprint_code: question.blueprint_code,
  concept_id: question.concept_label
    ? conceptIdByKey.get(`${question.domain}::${question.concept_label}`) || null
    : null,
  prompt: question.prompt,
  choices: question.choices,
  correct_index: question.correct_index,
  explanation: question.explanation,
  difficulty: question.difficulty || 'medium',
}));

const { error: questionInsertError } = await supabase
  .from('questions')
  .insert(questionRows);

if (questionInsertError) {
  console.error('Failed to insert questions:', questionInsertError.message);
  process.exit(1);
}

console.log(`Seeded ${questionRows.length} questions and ${conceptRows.length} concepts.`);
