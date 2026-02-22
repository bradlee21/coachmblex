import {
  getChoiceList,
  isFibAnswerCorrect,
  normalizeFreeText,
  resolveCorrectAnswerText,
  resolveCorrectChoiceIndex,
  resolveQuestionMode,
} from '../_components/questionRunnerLogic.mjs';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const SPRINT_DURATION_SECONDS = 60;
export const SPRINT_DECK_SIZE = 50;

export function createSprintStats() {
  return {
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
  };
}

export function applySprintAnswerOutcome(stats, isCorrect) {
  const prev = stats || createSprintStats();
  const nextAnswered = (Number(prev.answered) || 0) + 1;
  const nextCorrect = (Number(prev.correct) || 0) + (isCorrect ? 1 : 0);
  const nextStreak = isCorrect ? (Number(prev.streak) || 0) + 1 : 0;
  const nextBestStreak = Math.max(Number(prev.bestStreak) || 0, nextStreak);
  return {
    answered: nextAnswered,
    correct: nextCorrect,
    streak: nextStreak,
    bestStreak: nextBestStreak,
  };
}

export function formatSprintAccuracyPercent(stats) {
  const answered = Number(stats?.answered) || 0;
  const correct = Number(stats?.correct) || 0;
  if (answered <= 0) return '0%';
  return `${Math.round((correct / answered) * 100)}%`;
}

export function startSprintTimer(nowMs = Date.now(), durationSeconds = SPRINT_DURATION_SECONDS) {
  const safeNow = Number(nowMs) || Date.now();
  const safeDurationSeconds = Number(durationSeconds) > 0 ? Number(durationSeconds) : SPRINT_DURATION_SECONDS;
  return {
    startedAtMs: safeNow,
    endsAtMs: safeNow + safeDurationSeconds * 1000,
    durationSeconds: safeDurationSeconds,
  };
}

export function getSprintTimerSnapshot(timer, nowMs = Date.now()) {
  if (!timer) {
    return {
      remainingMs: 0,
      remainingSeconds: 0,
      isExpired: true,
    };
  }
  const safeNow = Number(nowMs) || Date.now();
  const remainingMs = Math.max(0, Math.ceil((Number(timer.endsAtMs) || 0) - safeNow));
  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isExpired: remainingMs <= 0,
  };
}

export function resolveSprintTimerIntent({ phase, timer, nowMs = Date.now() }) {
  if (phase !== 'playing' || !timer) return 'idle';
  return getSprintTimerSnapshot(timer, nowMs).isExpired ? 'finish' : 'continue';
}

export function buildSprintDeck(questions, limit = SPRINT_DECK_SIZE) {
  const safeLimit = Math.max(1, Number(limit) || SPRINT_DECK_SIZE);
  return (questions || [])
    .filter((question) => question && toText(question.prompt))
    .filter((question) => {
      const mode = resolveQuestionMode(question);
      return mode === 'mcq' || mode === 'fib';
    })
    .slice(0, safeLimit);
}

export function resolveSprintQuestionState(question) {
  const questionMode = resolveQuestionMode(question);
  const currentChoices = getChoiceList(question);
  const visibleChoices = currentChoices
    .map((choice, rawIndex) => ({ rawIndex, choice: toText(choice) }))
    .filter((item) => item.choice.length > 0);
  const resolvedCorrectIndex = resolveCorrectChoiceIndex(question);
  const resolvedCorrectChoiceText =
    typeof resolvedCorrectIndex === 'number' && resolvedCorrectIndex >= 0 && resolvedCorrectIndex < currentChoices.length
      ? toText(currentChoices[resolvedCorrectIndex])
      : '';
  const resolvedCorrectAnswerText = resolveCorrectAnswerText(question, resolvedCorrectChoiceText);

  return {
    questionMode,
    currentChoices,
    visibleChoices,
    resolvedCorrectIndex,
    resolvedCorrectAnswerText,
  };
}

export function gradeSprintAnswer(question, payload = {}) {
  const state = resolveSprintQuestionState(question);
  if (!question) {
    return {
      valid: false,
      isCorrect: false,
      ...state,
    };
  }

  if (state.questionMode === 'fib') {
    const inputText = toText(payload.inputText);
    if (normalizeFreeText(inputText) === '') {
      return {
        valid: false,
        isCorrect: false,
        inputText,
        ...state,
      };
    }
    return {
      valid: true,
      isCorrect: isFibAnswerCorrect(inputText, state.resolvedCorrectAnswerText),
      inputText,
      ...state,
    };
  }

  const choiceIndex = typeof payload.choiceIndex === 'number' ? payload.choiceIndex : null;
  if (choiceIndex == null) {
    return {
      valid: false,
      isCorrect: false,
      choiceIndex,
      ...state,
    };
  }

  return {
    valid: true,
    isCorrect: typeof state.resolvedCorrectIndex === 'number' && choiceIndex === state.resolvedCorrectIndex,
    choiceIndex,
    ...state,
  };
}
