export const BOSS_FIGHT_STARTING_HEARTS = 3;
export const BOSS_FIGHT_TARGET_SCORE = 10;
export const BOSS_FIGHT_DECK_SIZE = 50;

export function createBossFightStats() {
  return {
    answered: 0,
    correct: 0,
    score: 0,
    hearts: BOSS_FIGHT_STARTING_HEARTS,
  };
}

export function applyBossFightAnswerOutcome(stats, isCorrect) {
  const prev = stats || createBossFightStats();
  const nextAnswered = (Number(prev.answered) || 0) + 1;
  const nextCorrect = (Number(prev.correct) || 0) + (isCorrect ? 1 : 0);
  const nextScore = (Number(prev.score) || 0) + (isCorrect ? 1 : 0);
  const nextHearts = Math.max(0, (Number(prev.hearts) || 0) - (isCorrect ? 0 : 1));
  return {
    answered: nextAnswered,
    correct: nextCorrect,
    score: nextScore,
    hearts: nextHearts,
  };
}

export function resolveBossFightOutcome({ stats, remainingQuestions }) {
  const score = Number(stats?.score) || 0;
  const hearts = Number(stats?.hearts) || 0;
  const remaining = Number(remainingQuestions) || 0;
  if (score >= BOSS_FIGHT_TARGET_SCORE) return 'win';
  if (hearts <= 0) return 'loss';
  if (remaining <= 0) return 'exhausted';
  return 'playing';
}
