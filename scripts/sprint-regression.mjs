import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SPRINT_DECK_SIZE,
  SPRINT_DURATION_SECONDS,
  applySprintAnswerOutcome,
  buildSprintDeck,
  createSprintStats,
  getSprintTimerSnapshot,
  gradeSprintAnswer,
  resolveSprintTimerIntent,
  startSprintTimer,
} from '../app/sprint/sprintLogic.mjs';

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

const sprintPageSource = read('app/sprint/page.js');

assertMatch(sprintPageSource, /<h1[^>]*>Sprint<\/h1>/, 'Expected Sprint page heading.');
assertMatch(sprintPageSource, /Start Sprint/, 'Expected Sprint page to render a start action.');
assertMatch(
  sprintPageSource,
  /resolveAnswerHotkeyChoicePosition\(/,
  'Expected Sprint page to reuse question runner hotkey resolution.'
);

const emptyStats = createSprintStats();
assert(emptyStats.answered === 0 && emptyStats.correct === 0, 'Expected empty sprint stats defaults.');
assert(emptyStats.streak === 0 && emptyStats.bestStreak === 0, 'Expected empty streak defaults.');

let stats = applySprintAnswerOutcome(emptyStats, true);
assert(stats.answered === 1, 'Expected answered count to increment.');
assert(stats.correct === 1, 'Expected correct count to increment on correct answer.');
assert(stats.streak === 1, 'Expected streak to increment on correct answer.');
assert(stats.bestStreak === 1, 'Expected best streak to track the current streak.');

stats = applySprintAnswerOutcome(stats, true);
assert(stats.streak === 2 && stats.bestStreak === 2, 'Expected streak and best streak to continue.');

stats = applySprintAnswerOutcome(stats, false);
assert(stats.answered === 3, 'Expected answered count to continue increasing.');
assert(stats.correct === 2, 'Expected correct count to stay flat on incorrect answer.');
assert(stats.streak === 0, 'Expected streak reset on incorrect answer.');
assert(stats.bestStreak === 2, 'Expected best streak to persist after streak reset.');

const timer = startSprintTimer(1000, 60);
const timerMid = getSprintTimerSnapshot(timer, 1500);
assert(timerMid.isExpired === false, 'Expected sprint timer to remain active before deadline.');
assert(timerMid.remainingSeconds === 60, 'Expected timer snapshot to round up remaining seconds.');
assert(
  resolveSprintTimerIntent({ phase: 'playing', timer, nowMs: 1500 }) === 'continue',
  'Expected timer intent to continue while time remains.'
);
assert(
  resolveSprintTimerIntent({ phase: 'playing', timer, nowMs: 61000 }) === 'finish',
  'Expected timer intent to finish at expiration.'
);
assert(
  resolveSprintTimerIntent({ phase: 'idle', timer, nowMs: 1500 }) === 'idle',
  'Expected timer intent to idle when sprint is not playing.'
);

const deck = buildSprintDeck(
  [
    { id: 'mcq-1', prompt: 'MCQ', question_type: 'mcq', choices: ['A', 'B'], correct_index: 0 },
    { id: 'fib-1', prompt: 'FIB', question_type: 'fill', correct_text: 'Answer' },
    { id: 'bad-1', prompt: '', question_type: 'mcq', choices: ['A'], correct_index: 0 },
  ],
  2
);
assert(deck.length === 2, 'Expected sprint deck helper to cap the deck size.');

const mcqQuestion = {
  id: 'sprint-mcq',
  prompt: 'Which letter is first?',
  question_type: 'mcq',
  choices: ['A', 'B', 'C', 'D'],
  correct_index: 0,
  explanation: { answer: 'A' },
};
const mcqGrade = gradeSprintAnswer(mcqQuestion, { choiceIndex: 0 });
assert(mcqGrade.valid === true, 'Expected MCQ submission to be valid.');
assert(mcqGrade.isCorrect === true, 'Expected MCQ grading to mark the correct index.');

const fibQuestion = {
  id: 'sprint-fib',
  prompt: 'Fill in the blank',
  question_type: 'fill',
  correct_text: 'median nerve',
};
const fibGrade = gradeSprintAnswer(fibQuestion, { inputText: 'Median nerve' });
assert(fibGrade.valid === true, 'Expected FIB submission to be valid.');
assert(fibGrade.isCorrect === true, 'Expected FIB grading to reuse normalized matching.');

assert(SPRINT_DURATION_SECONDS === 60, 'Expected Sprint duration constant to remain 60s.');
assert(SPRINT_DECK_SIZE === 50, 'Expected Sprint deck size constant to remain 50.');

console.log('Sprint regression checks passed.');
