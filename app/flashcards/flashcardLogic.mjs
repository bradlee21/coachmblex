import { resolveExplanationParts } from '../_components/questionRunnerLogic.mjs';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimeMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIndexFromNumber(value, choiceCount) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0 && value < choiceCount) return value;
    if (value >= 1 && value <= choiceCount) return value - 1;
  }
  const asText = toText(value);
  if (!/^-?\d+$/.test(asText)) return null;
  const parsed = Number(asText);
  if (!Number.isInteger(parsed)) return null;
  if (parsed >= 0 && parsed < choiceCount) return parsed;
  if (parsed >= 1 && parsed <= choiceCount) return parsed - 1;
  return null;
}

export const FLASHCARD_RATINGS = [
  { key: '1', value: 'again', label: 'Again' },
  { key: '2', value: 'hard', label: 'Hard' },
  { key: '3', value: 'good', label: 'Good' },
  { key: '4', value: 'easy', label: 'Easy' },
];

export function getChoiceList(question) {
  if (Array.isArray(question?.choices)) return question.choices;
  if (question?.choices && typeof question.choices === 'object') {
    return ['A', 'B', 'C', 'D']
      .map((key) => question.choices[key])
      .filter((value) => value != null);
  }
  return [];
}

export function resolveFlashcardBackDetails(question) {
  const choices = getChoiceList(question);
  const correctChoiceIndex = toIndexFromNumber(question?.correct_index, choices.length);
  const choiceAnswer =
    typeof correctChoiceIndex === 'number' ? toText(choices[correctChoiceIndex]) : '';
  const parts = resolveExplanationParts(question);

  const answer = parts.answer || choiceAnswer;
  const why = parts.why;
  const trap = parts.trap;
  const hook = parts.hook;

  return {
    answer: answer || '--',
    why: why || '--',
    trap: trap || '--',
    hook: hook || '--',
  };
}

export function getFlashcardStorageKey(userId) {
  return `coachMblexFlashcards:${toText(userId) || 'anon'}`;
}

export function parseFlashcardOutcomes(rawValue) {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next = {};
    for (const [questionId, outcome] of Object.entries(parsed)) {
      if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) continue;
      const lastRating = toText(outcome.lastRating).toLowerCase();
      if (!FLASHCARD_RATINGS.some((item) => item.value === lastRating)) continue;
      const lastSeenAt = normalizeTimeMs(outcome.lastSeenAt);
      next[String(questionId)] = {
        lastRating,
        lastSeenAt: lastSeenAt || Date.now(),
      };
    }
    return next;
  } catch {
    return {};
  }
}

export function serializeFlashcardOutcomes(outcomes) {
  return JSON.stringify(outcomes || {});
}

export function applyFlashcardOutcome(outcomes, questionId, ratingValue, seenAt = Date.now()) {
  const normalizedRating = toText(ratingValue).toLowerCase();
  if (!FLASHCARD_RATINGS.some((item) => item.value === normalizedRating)) return outcomes || {};
  return {
    ...(outcomes || {}),
    [String(questionId)]: {
      lastRating: normalizedRating,
      lastSeenAt: normalizeTimeMs(seenAt) || Date.now(),
    },
  };
}

export function rankFlashcardQuestions(questions, outcomes, limit = 20) {
  const safeOutcomes = outcomes || {};
  return [...(questions || [])]
    .sort((a, b) => {
      const aKey = String(a?.id || '');
      const bKey = String(b?.id || '');
      const aOutcome = safeOutcomes[aKey];
      const bOutcome = safeOutcomes[bKey];
      const aSeen = Boolean(aOutcome);
      const bSeen = Boolean(bOutcome);
      if (aSeen !== bSeen) return aSeen ? 1 : -1;

      const aLastSeenAt = normalizeTimeMs(aOutcome?.lastSeenAt);
      const bLastSeenAt = normalizeTimeMs(bOutcome?.lastSeenAt);
      if (aLastSeenAt !== bLastSeenAt) return aLastSeenAt - bLastSeenAt;

      const aCreatedAt = normalizeTimeMs(a?.created_at);
      const bCreatedAt = normalizeTimeMs(b?.created_at);
      if (aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

      return aKey.localeCompare(bKey);
    })
    .slice(0, limit);
}

export function toggleFlashcardSide(isFlipped) {
  return !Boolean(isFlipped);
}

export function resolveFlashcardHotkeyAction({ key, isFlipped }) {
  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey === ' ' || normalizedKey === 'spacebar') {
    return { type: 'flip' };
  }
  const rating = FLASHCARD_RATINGS.find((item) => item.key === normalizedKey);
  if (!rating || !isFlipped) return null;
  return {
    type: 'rate',
    rating: rating.value,
  };
}
