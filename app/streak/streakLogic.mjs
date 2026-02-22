export const STREAK_TARGET = 15;
export const STREAK_DECK_SIZE = 50;

export function createStreakStats() {
  return {
    answered: 0,
    correctCount: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
  };
}

export function applyStreakOutcome(stats, { correct }) {
  const prev = stats || createStreakStats();
  const isCorrect = Boolean(correct);
  const nextAnswered = (Number(prev.answered) || 0) + 1;
  const nextCorrectCount = (Number(prev.correctCount) || 0) + (isCorrect ? 1 : 0);
  const nextScore = (Number(prev.score) || 0) + (isCorrect ? 1 : 0);
  const nextStreak = isCorrect ? (Number(prev.streak) || 0) + 1 : 0;
  const nextBestStreak = Math.max(Number(prev.bestStreak) || 0, nextStreak);
  return {
    answered: nextAnswered,
    correctCount: nextCorrectCount,
    score: nextScore,
    streak: nextStreak,
    bestStreak: nextBestStreak,
  };
}

export function resolveStreakEnd({ stats, remainingQuestions }) {
  const streak = Number(stats?.streak) || 0;
  const remaining = Number(remainingQuestions) || 0;
  if (streak >= STREAK_TARGET) return 'won';
  if (remaining <= 0) return 'exhausted';
  return 'playing';
}
