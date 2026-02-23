import { readFileSync } from 'node:fs';

const source = readFileSync('app/drill/page.js', 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const domainStrategyIndex = source.indexOf("{ key: 'domain', kind: 'column', path: 'domain', label: 'domain' }");
const packIdStrategyIndex = source.indexOf("{ key: 'pack_id', kind: 'column', path: 'pack_id', label: 'pack_id' }");

assert(domainStrategyIndex >= 0, 'Expected domain filter strategy in Drill page');
assert(packIdStrategyIndex >= 0, 'Expected pack_id filter strategy in Drill page');
assert(
  domainStrategyIndex < packIdStrategyIndex,
  'Expected domain filter strategy to be checked before pack_id'
);

assert(
  source.includes('const explicitDomain = toText(question?.domain);'),
  'Expected explicitDomain helper in resolveQuestionPackInfo'
);
assert(
  source.includes('const packId =\n    explicitDomain ||'),
  'Expected Drill subject id to prefer question.domain'
);
assert(
  source.includes('const packLabel =\n    explicitDomain ||'),
  'Expected Drill subject label to prefer question.domain'
);

console.log('Drill subject regression checks passed.');
