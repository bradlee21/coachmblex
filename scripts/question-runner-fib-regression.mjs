import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveAnswerHotkeyChoicePosition,
  resolveFibFeedbackState,
  resolveFibInputEnterIntent,
  resolveQuestionMode,
} from '../app/_components/questionRunnerLogic.mjs';

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

const fibFixture = {
  id: 'fib-regression-001',
  prompt: 'The largest branch of the brachial plexus is the ____ nerve.',
  question_type: 'fill',
  choices: ['', ''],
  correct_answer: 'median',
  explanation: {
    answer: 'median',
    why: 'Median nerve receives fibers from both lateral and medial cords.',
  },
};

const questionRunnerSource = read('app/_components/QuestionRunner.js');

const mode = resolveQuestionMode(fibFixture);
assert(mode === 'fib', `Expected fixture mode to resolve to fib, received "${mode}".`);

assertMatch(
  questionRunnerSource,
  /id="fib-answer"/,
  'Expected QuestionRunner fib mode to render a text input.'
);

let selectedChoicePosition = null;
let submitted = false;

for (const key of ['1', '2']) {
  const hotkeyChoicePosition = resolveAnswerHotkeyChoicePosition({
    questionMode: mode,
    key,
    visibleChoiceCount: 4,
  });

  if (hotkeyChoicePosition != null) {
    selectedChoicePosition = hotkeyChoicePosition;
    submitted = true;
  }
}

assert(
  selectedChoicePosition == null && submitted === false,
  'Expected 1/2 hotkeys to be ignored in fib mode (no selection, not submitted).'
);

const userInput = 'median';
const enterIntent = resolveFibInputEnterIntent({ key: 'Enter', submitted });
assert(enterIntent === 'submit', `Expected Enter to submit in fib mode, got "${enterIntent}".`);
submitted = enterIntent === 'submit';

const feedback = resolveFibFeedbackState({
  questionMode: mode,
  submitted,
  userInput,
  resolvedCorrectAnswerText: fibFixture.correct_answer,
});

assert(feedback?.isCorrect === true, 'Expected correct fib submission to evaluate as correct.');
assert(feedback?.label === 'Correct', 'Expected fib correct submission to surface "Correct".');

console.log('QuestionRunner FIB regression checks passed.');
