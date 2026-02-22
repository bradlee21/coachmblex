import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MEMORY_DEFAULT_PAIR_COUNT,
  buildMemoryDeck,
  canFlip,
  flipCard,
  isWin,
  resolveTurn,
} from '../app/memory/memoryLogic.mjs';

function read(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMatch(source, pattern, message) {
  assert(pattern.test(source), message);
}

const memoryPageSourcePath = 'app/memory/page.js';
let memoryPageSource = '';
try {
  memoryPageSource = read(memoryPageSourcePath);
} catch {
  memoryPageSource = '';
}

if (memoryPageSource) {
  assertMatch(memoryPageSource, /<h1[^>]*>Memory Match<\/h1>/, 'Expected Memory Match page heading.');
  assertMatch(memoryPageSource, /Start Memory Match/, 'Expected Memory Match start action.');
}

const fixtureQuestions = [
  {
    id: 'q1',
    prompt: 'Question 1',
    question_type: 'mcq',
    choices: ['A1', 'B1'],
    correct_index: 1,
  },
  {
    id: 'q2',
    prompt: 'Question 2',
    question_type: 'fill',
    correct_text: 'Fib 2',
  },
  {
    id: 'q3',
    prompt: 'Question 3',
    question_type: 'mcq',
    choices: ['A3', 'B3'],
    correct_index: 0,
  },
];

let rngCalls = 0;
const deterministicDeck = buildMemoryDeck(fixtureQuestions, 2, () => {
  rngCalls += 1;
  return 0.25;
});
assert(rngCalls > 0, 'Expected buildMemoryDeck to use injected RNG.');
assert(deterministicDeck.length === 4, 'Expected 2 pairs to produce 4 memory cards.');

const pairCounts = new Map();
for (const card of deterministicDeck) {
  pairCounts.set(card.pairId, (pairCounts.get(card.pairId) || 0) + 1);
  assert(['prompt', 'answer'].includes(card.kind), 'Expected memory card kind to be prompt or answer.');
  assert(typeof card.text === 'string' && card.text.trim() !== '', 'Expected memory card text.');
  assert(card.faceUp === false && card.matched === false, 'Expected new deck cards to start face-down and unmatched.');
}
assert(
  Array.from(pairCounts.values()).every((count) => count === 2),
  'Expected exactly two cards per pairId.'
);
assert(MEMORY_DEFAULT_PAIR_COUNT === 8, 'Expected default memory pair count to remain 8.');

const mismatchState0 = {
  cards: [
    { id: 'a:prompt', pairId: 'a', kind: 'prompt', text: 'A?', faceUp: false, matched: false },
    { id: 'a:answer', pairId: 'a', kind: 'answer', text: 'A!', faceUp: false, matched: false },
    { id: 'b:prompt', pairId: 'b', kind: 'prompt', text: 'B?', faceUp: false, matched: false },
    { id: 'b:answer', pairId: 'b', kind: 'answer', text: 'B!', faceUp: false, matched: false },
  ],
  moves: 0,
  startedAtMs: null,
};

assert(canFlip(mismatchState0, 'a:prompt') === true, 'Expected first flip to be allowed.');
const mismatchState1 = flipCard(mismatchState0, 'a:prompt', 1000);
assert(mismatchState1.startedAtMs === 1000, 'Expected timer to start on first flip.');
assert(mismatchState1.moves === 0, 'Expected moves to remain 0 until second flip.');

const mismatchState2 = flipCard(mismatchState1, 'b:answer', 1200);
assert(mismatchState2.moves === 1, 'Expected second flip to increment move count.');
assert(canFlip(mismatchState2, 'a:answer') === false, 'Expected third flip to be blocked while two cards are face-up.');

const mismatchResolved = resolveTurn(mismatchState2);
assert(mismatchResolved.outcome === 'mismatch', 'Expected mismatch outcome for different pairIds.');
assert(
  mismatchResolved.state.cards.filter((card) => card.faceUp && !card.matched).length === 0,
  'Expected mismatch resolution to flip both cards back down.'
);

const matchState0 = {
  cards: [
    { id: 'x:prompt', pairId: 'x', kind: 'prompt', text: 'X?', faceUp: false, matched: false },
    { id: 'x:answer', pairId: 'x', kind: 'answer', text: 'X!', faceUp: false, matched: false }
  ],
  moves: 0,
  startedAtMs: null,
};
const matchState1 = flipCard(matchState0, 'x:prompt', 2000);
const matchState2 = flipCard(matchState1, 'x:answer', 2100);
const matchResolved = resolveTurn(matchState2);
assert(matchResolved.outcome === 'match', 'Expected match outcome for same pairId.');
assert(
  matchResolved.state.cards.every((card) => card.matched && card.faceUp),
  'Expected match resolution to keep matched cards face-up.'
);
assert(isWin(matchResolved.state) === true, 'Expected win when all memory cards are matched.');

console.log('Memory regression checks passed.');
