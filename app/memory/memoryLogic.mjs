import { shuffleArray } from '../_components/questionRunnerLogic.mjs';
import { buildSprintDeck, resolveSprintQuestionState } from '../sprint/sprintLogic.mjs';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const MEMORY_DEFAULT_PAIR_COUNT = 8;

export function buildMemoryDeck(questions, pairCount = MEMORY_DEFAULT_PAIR_COUNT, rng = Math.random) {
  const targetPairs = Math.max(1, Number(pairCount) || MEMORY_DEFAULT_PAIR_COUNT);
  const candidateQuestions = buildSprintDeck(
    questions || [],
    Math.max(targetPairs, Array.isArray(questions) ? questions.length : targetPairs),
    rng
  );

  const pairs = [];
  for (const question of candidateQuestions) {
    if (pairs.length >= targetPairs) break;
    const prompt = toText(question?.prompt);
    const state = resolveSprintQuestionState(question);
    const answer = toText(state.resolvedCorrectAnswerText);
    if (!prompt || !answer) continue;
    const pairId = String(question?.id || `pair-${pairs.length + 1}`);
    pairs.push({
      pairId,
      prompt,
      answer,
    });
  }

  const cards = pairs.flatMap((pair) => [
    {
      id: `${pair.pairId}:prompt`,
      pairId: pair.pairId,
      kind: 'prompt',
      text: pair.prompt,
      matched: false,
      faceUp: false,
    },
    {
      id: `${pair.pairId}:answer`,
      pairId: pair.pairId,
      kind: 'answer',
      text: pair.answer,
      matched: false,
      faceUp: false,
    },
  ]);

  return shuffleArray(cards, rng);
}

export function canFlip(state, cardId) {
  if (!state || !Array.isArray(state.cards)) return false;
  if (!cardId) return false;
  const faceUpUnmatchedCount = state.cards.filter((card) => card.faceUp && !card.matched).length;
  if (faceUpUnmatchedCount >= 2) return false;
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) return false;
  if (card.matched) return false;
  if (card.faceUp) return false;
  return true;
}

export function flipCard(state, cardId, nowMs = Date.now()) {
  if (!canFlip(state, cardId)) {
    return state;
  }
  const safeNow = Number(nowMs) || Date.now();
  const nextCards = state.cards.map((card) =>
    card.id === cardId ? { ...card, faceUp: true } : card
  );
  const faceUpUnmatchedIds = nextCards.filter((card) => card.faceUp && !card.matched).map((card) => card.id);
  const nextMoves = faceUpUnmatchedIds.length === 2 ? (Number(state.moves) || 0) + 1 : Number(state.moves) || 0;

  return {
    ...state,
    cards: nextCards,
    moves: nextMoves,
    startedAtMs: state.startedAtMs ?? safeNow,
  };
}

export function resolveTurn(state) {
  if (!state || !Array.isArray(state.cards)) {
    return { state, outcome: 'idle' };
  }
  const faceUpUnmatched = state.cards.filter((card) => card.faceUp && !card.matched);
  if (faceUpUnmatched.length !== 2) {
    return { state, outcome: 'idle' };
  }

  const [first, second] = faceUpUnmatched;
  const isMatch = first.pairId === second.pairId;

  if (isMatch) {
    return {
      outcome: 'match',
      state: {
        ...state,
        cards: state.cards.map((card) =>
          card.id === first.id || card.id === second.id ? { ...card, matched: true, faceUp: true } : card
        ),
      },
    };
  }

  return {
    outcome: 'mismatch',
    state: {
      ...state,
      cards: state.cards.map((card) =>
        card.id === first.id || card.id === second.id ? { ...card, faceUp: false } : card
      ),
    },
  };
}

export function isWin(state) {
  if (!state || !Array.isArray(state.cards) || state.cards.length === 0) return false;
  return state.cards.every((card) => card.matched);
}
