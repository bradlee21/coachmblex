import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BOSS_FIGHT_STARTING_HEARTS,
  BOSS_FIGHT_TARGET_SCORE,
  applyBossFightAnswerOutcome,
  createBossFightStats,
  resolveBossFightOutcome,
} from '../app/boss-fight/bossFightLogic.mjs';

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

const bossFightPageSource = read('app/boss-fight/page.js');
assertMatch(bossFightPageSource, /<h1[^>]*>Boss Fight<\/h1>/, 'Expected Boss Fight page heading.');
assertMatch(bossFightPageSource, /Start Boss Fight/, 'Expected Boss Fight start action.');

const base = createBossFightStats();
assert(base.hearts === 3, 'Expected Boss Fight to start with 3 hearts.');
assert(base.score === 0 && base.correct === 0 && base.answered === 0, 'Expected zeroed boss fight stats.');

const afterCorrect = applyBossFightAnswerOutcome(base, true);
assert(afterCorrect.hearts === base.hearts, 'Expected no heart loss on correct answer.');
assert(afterCorrect.score === 1, 'Expected score increment on correct answer.');
assert(afterCorrect.correct === 1, 'Expected correct count increment on correct answer.');
assert(afterCorrect.answered === 1, 'Expected answered count increment on correct answer.');

const afterWrong = applyBossFightAnswerOutcome(afterCorrect, false);
assert(afterWrong.hearts === 2, 'Expected hearts to decrement on wrong answer.');
assert(afterWrong.score === afterCorrect.score, 'Expected score not to increment on wrong answer.');
assert(afterWrong.correct === afterCorrect.correct, 'Expected correct count not to increment on wrong answer.');
assert(afterWrong.answered === 2, 'Expected answered count increment on wrong answer.');

const winningStats = {
  ...base,
  score: BOSS_FIGHT_TARGET_SCORE,
  correct: BOSS_FIGHT_TARGET_SCORE,
  hearts: BOSS_FIGHT_STARTING_HEARTS,
};
assert(
  resolveBossFightOutcome({ stats: winningStats, remainingQuestions: 20 }) === 'win',
  'Expected boss fight to win at target score.'
);

const losingStats = {
  ...base,
  score: 4,
  correct: 4,
  hearts: 0,
};
assert(
  resolveBossFightOutcome({ stats: losingStats, remainingQuestions: 20 }) === 'loss',
  'Expected boss fight to lose at zero hearts.'
);

const exhaustedStats = {
  ...base,
  score: 6,
  correct: 6,
  hearts: 1,
};
assert(
  resolveBossFightOutcome({ stats: exhaustedStats, remainingQuestions: 0 }) === 'exhausted',
  'Expected boss fight to end with exhausted deck when no win/loss condition is met.'
);

console.log('Boss Fight regression checks passed.');
