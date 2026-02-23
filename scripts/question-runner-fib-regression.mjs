import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveAnswerHotkeyChoicePosition,
  resolveFibFeedbackState,
  resolveFibInputEnterIntent,
  resolveQuestionMode,
} from '../app/_components/questionRunnerLogic.mjs';
import { shuffleArray } from '../app/_utils/shuffleArray.mjs';

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
assertMatch(
  questionRunnerSource,
  /const visibleChoices = useMemo\([\s\S]*shuffleArray\(/,
  'Expected QuestionRunner visibleChoices to use shuffleArray for per-question choice order.'
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

const originalOrder = [1, 2, 3, 4];
const rngValues = [0.1, 0.9, 0.0];
let rngIndex = 0;
const shuffled = shuffleArray(originalOrder, () => {
  const next = rngValues[rngIndex] ?? 0;
  rngIndex += 1;
  return next;
});

assert(
  JSON.stringify(originalOrder) === JSON.stringify([1, 2, 3, 4]),
  'Expected shuffleArray to return a new array and not mutate the original input.'
);
assert(
  JSON.stringify(shuffled) === JSON.stringify([2, 4, 3, 1]),
  `Expected deterministic Fisher-Yates shuffle output, received ${JSON.stringify(shuffled)}.`
);

const sourceChoices = ['Correct', 'B', 'C', 'D'];
const correctIndex = 0;
const decoratedChoices = sourceChoices.map((choice, rawIndex) => ({ choice, rawIndex }));
const mcqRngValues = [0.2, 0.2, 0.2];
let mcqRngIndex = 0;
const shuffledChoices = shuffleArray(decoratedChoices, () => {
  const next = mcqRngValues[mcqRngIndex] ?? 0;
  mcqRngIndex += 1;
  return next;
});

assert(
  shuffledChoices.some((item, position) => item.rawIndex !== position),
  'Expected shuffled MCQ display order to differ from raw source order for regression fixture.'
);

const displayedCorrectPosition = shuffledChoices.findIndex((item) => item.rawIndex === correctIndex);
assert(displayedCorrectPosition >= 0, 'Expected shuffled MCQ fixture to retain the correct choice.');
const submittedRawIndex = shuffledChoices[displayedCorrectPosition].rawIndex;
assert(
  submittedRawIndex === correctIndex,
  'Expected grading to evaluate correctness using the shuffled choice rawIndex mapping.'
);

console.log('QuestionRunner FIB regression checks passed.');
