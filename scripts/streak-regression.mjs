import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  STREAK_TARGET,
  applyStreakOutcome,
  createStreakStats,
  resolveStreakEnd,
} from '../app/streak/streakLogic.mjs';

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

const streakPageSource = read('app/streak/page.js');
assertMatch(streakPageSource, /<h1[^>]*>Streak Ladder<\/h1>/, 'Expected Streak Ladder page heading.');
assertMatch(streakPageSource, /Start Streak Ladder/, 'Expected Streak Ladder start action.');

const base = createStreakStats();
assert(base.streak === 0, 'Expected initial streak to be 0.');
assert(base.bestStreak === 0, 'Expected initial best streak to be 0.');

let stats = applyStreakOutcome(base, { correct: true });
assert(stats.streak === 1, 'Expected correct answer to increment streak.');
assert(stats.bestStreak === 1, 'Expected best streak to update after first correct.');
assert(stats.score === 1, 'Expected score to increment on correct.');
assert(stats.correctCount === 1, 'Expected correctCount to increment on correct.');
assert(stats.answered === 1, 'Expected answered to increment on correct.');

stats = applyStreakOutcome(stats, { correct: true });
assert(stats.streak === 2, 'Expected streak to continue incrementing on consecutive correct.');
assert(stats.bestStreak === 2, 'Expected bestStreak to track longest streak.');

stats = applyStreakOutcome(stats, { correct: false });
assert(stats.streak === 0, 'Expected wrong answer to reset current streak.');
assert(stats.bestStreak === 2, 'Expected bestStreak to persist after reset.');
assert(stats.score === 2, 'Expected score to remain unchanged on wrong answer.');
assert(stats.answered === 3, 'Expected answered to increment on wrong answer.');

const winningStats = { ...stats, streak: STREAK_TARGET, bestStreak: STREAK_TARGET };
assert(
  resolveStreakEnd({ stats: winningStats, remainingQuestions: 10 }) === 'won',
  'Expected Streak Ladder to win at target streak.'
);

const exhaustedStats = { ...stats, streak: STREAK_TARGET - 1, bestStreak: STREAK_TARGET - 1 };
assert(
  resolveStreakEnd({ stats: exhaustedStats, remainingQuestions: 0 }) === 'exhausted',
  'Expected Streak Ladder to exhaust when deck ends before target streak.'
);

console.log('Streak regression checks passed.');
