import { readFileSync } from 'node:fs';

const source = readFileSync('app/drill/page.js', 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes("let next = query.eq(TEST_PACK_ID_COLUMN, toText(packId));"),
  'Expected Targeted Drill filtering to use questions.pack_id directly'
);
assert(
  source.includes("setPacksError('questions.pack_id column is required for Targeted Drill.')"),
  'Expected clear pack_id-only error when questions.pack_id is unavailable'
);
assert(
  source.includes('const packId = toText(question?.pack_id);'),
  'Expected Drill subject options to key off question.pack_id'
);
assert(
  source.includes("const explicitDomain = toText(question?.domain);"),
  'Expected Drill subject label to still prefer question.domain when present'
);

console.log('Drill subject regression checks passed.');
