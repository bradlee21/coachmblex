import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { practiceModes } from '../app/practice/modes.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expected = [
  ['today', '/today'],
  ['review', '/review'],
  ['drill', '/drill'],
  ['flashcards', '/flashcards'],
  ['sprint', '/sprint'],
  ['boss-fight', '/boss-fight'],
  ['streak', '/streak'],
  ['memory', '/memory'],
];

assert(Array.isArray(practiceModes), 'Expected practiceModes export to be an array.');
assert(practiceModes.length === expected.length, 'Expected exactly 8 practice modes.');

const seenSlugs = new Set();
const seenRoutes = new Set();
for (const mode of practiceModes) {
  assert(typeof mode.slug === 'string' && mode.slug, 'Each mode must have slug.');
  assert(typeof mode.name === 'string' && mode.name, 'Each mode must have name.');
  assert(typeof mode.href === 'string' && mode.href.startsWith('/'), 'Each mode must have route.');
  assert(typeof mode.description === 'string' && mode.description.trim(), 'Each mode needs description.');
  assert(!seenSlugs.has(mode.slug), `Duplicate mode slug: ${mode.slug}`);
  assert(!seenRoutes.has(mode.href), `Duplicate mode route: ${mode.href}`);
  seenSlugs.add(mode.slug);
  seenRoutes.add(mode.href);
}

for (const [slug, href] of expected) {
  assert(seenSlugs.has(slug), `Missing practice mode slug: ${slug}`);
  assert(seenRoutes.has(href), `Missing practice mode route: ${href}`);
}

const pageSource = readFileSync(resolve(process.cwd(), 'app/practice/page.js'), 'utf8');
assert(pageSource.includes('data-testid="practice-hub"'), 'Expected practice hub test id on page root.');
assert(
  pageSource.includes('practice-card-${mode.slug}') || pageSource.includes('practice-card-'),
  'Expected practice card test id pattern in page source.'
);

console.log('Practice hub regression checks passed.');

