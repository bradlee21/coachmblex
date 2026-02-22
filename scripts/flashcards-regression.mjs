import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FLASHCARD_RATINGS,
  applyFlashcardOutcome,
  rankFlashcardQuestions,
  resolveFlashcardBackDetails,
  resolveFlashcardHotkeyAction,
  toggleFlashcardSide,
} from '../app/flashcards/flashcardLogic.mjs';

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

const flashcardsPageSource = read('app/flashcards/page.js');

assertMatch(
  flashcardsPageSource,
  /<h1>Flashcards<\/h1>/,
  'Expected /flashcards page to expose a stable Flashcards heading.'
);

assertMatch(
  flashcardsPageSource,
  /data-testid="flashcard-card"/,
  'Expected /flashcards page to render a stable flashcard card container.'
);

assertMatch(
  flashcardsPageSource,
  /const \[isFlipped, setIsFlipped\] = useState\(false\);/,
  'Expected /flashcards page to default the card to the front side.'
);

assertMatch(
  flashcardsPageSource,
  /setIndex\(\(prev\) => prev \+ 1\);\s*setIsFlipped\(false\);/,
  'Expected advancing to the next flashcard to reset to the front side.'
);

assertMatch(
  flashcardsPageSource,
  /isFlipped \? 'Show Prompt \(Space\)' : 'Show Answer \(Space\)'/,
  'Expected flip control label to reflect the current card side.'
);

assertMatch(
  flashcardsPageSource,
  /!isFlipped \?[\s\S]*runner-prompt[\s\S]*: \([\s\S]*flashcard-answer[\s\S]*<details>[\s\S]*Why \/ Trap \/ Hook/,
  'Expected prompt on front and answer/details only on the back side.'
);

assertMatch(
  flashcardsPageSource,
  /resolveFlashcardHotkeyAction\(/,
  'Expected /flashcards page to route keyboard handling through resolver helper.'
);

const fixtureQuestion = {
  id: 'flashcard-regression-1',
  prompt: 'Which nerve roots contribute to the median nerve?',
  explanation: {
    answer: 'C5-T1',
    why: 'Median nerve fibers arise from lateral and medial cords.',
    trap: 'Ulnar is C8-T1 only, not the full median pattern.',
    hook: 'Median = middle blend from both cords.',
  },
  created_at: '2026-02-10T00:00:00.000Z',
};

const details = resolveFlashcardBackDetails(fixtureQuestion);
assert(details.answer === 'C5-T1', 'Expected flashcard answer to resolve from explanation.answer.');
assert(details.why.includes('lateral and medial cords'), 'Expected flashcard why detail.');
assert(details.trap.includes('Ulnar'), 'Expected flashcard trap detail.');
assert(details.hook.includes('Median = middle'), 'Expected flashcard hook detail.');
assert(details.why !== '--', 'Expected nested explanation.why to render a non-empty flashcard detail.');
assert(details.trap !== '--', 'Expected nested explanation.trap to render a non-empty flashcard detail.');
assert(details.hook !== '--', 'Expected nested explanation.hook to render a non-empty flashcard detail.');

const flatFixtureQuestion = {
  id: 'flashcard-regression-2',
  prompt: 'Which cranial nerve is responsible for smell?',
  correct_text: 'Olfactory nerve (CN I)',
  why: 'CN I carries special sensory fibers for olfaction.',
  trap: 'Optic nerve (CN II) is vision, not smell.',
  hook: '1 = nose run; CN I = smell.',
};

const flatDetails = resolveFlashcardBackDetails(flatFixtureQuestion);
assert(flatDetails.answer.includes('CN I'), 'Expected flashcard answer to resolve from flat correct_text.');
assert(flatDetails.why.includes('olfaction'), 'Expected flashcard why to resolve from flat why.');
assert(flatDetails.trap.includes('vision'), 'Expected flashcard trap to resolve from flat trap.');
assert(flatDetails.hook.includes('smell'), 'Expected flashcard hook to resolve from flat hook.');

let isFlipped = false;
const flipAction = resolveFlashcardHotkeyAction({ key: ' ', isFlipped });
assert(flipAction?.type === 'flip', 'Expected Space to trigger flip action.');
isFlipped = toggleFlashcardSide(isFlipped);
assert(isFlipped === true, 'Expected flip helper to toggle to back side.');

const blockedRate = resolveFlashcardHotkeyAction({ key: '2', isFlipped: false });
assert(blockedRate == null, 'Expected rating hotkeys to be gated until card is flipped.');

const rateAction = resolveFlashcardHotkeyAction({ key: '1', isFlipped });
assert(rateAction?.type === 'rate', 'Expected numeric hotkeys to trigger a rating action.');
assert(rateAction?.rating === 'again', 'Expected key 1 to map to Again rating.');
assert(FLASHCARD_RATINGS.length === 4, 'Expected four MVP rating tiers.');

const updatedOutcomes = applyFlashcardOutcome({}, fixtureQuestion.id, rateAction.rating, 1700000000000);
assert(
  updatedOutcomes[fixtureQuestion.id]?.lastRating === 'again',
  'Expected rating persistence helper to store lastRating.'
);
assert(
  updatedOutcomes[fixtureQuestion.id]?.lastSeenAt === 1700000000000,
  'Expected rating persistence helper to store lastSeenAt timestamp.'
);

const ranked = rankFlashcardQuestions(
  [
    { id: 'seen-recent', created_at: '2026-02-20T00:00:00.000Z' },
    { id: 'unseen', created_at: '2026-02-19T00:00:00.000Z' },
    { id: 'seen-older', created_at: '2026-02-18T00:00:00.000Z' },
  ],
  {
    'seen-recent': { lastRating: 'good', lastSeenAt: 2000 },
    'seen-older': { lastRating: 'hard', lastSeenAt: 1000 },
  },
  3
);

assert(ranked[0]?.id === 'unseen', 'Expected unseen flashcards to be prioritized first.');
assert(
  ranked[1]?.id === 'seen-older',
  'Expected older seen flashcards to be prioritized before recently seen cards.'
);

console.log('Flashcards regression checks passed.');
