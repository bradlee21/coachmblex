function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseMaybeObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeText(value) {
  return toText(value).toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeFreeText(value) {
  return normalizeText(value).replace(/[.,!?;:]+$/g, '');
}

function hasPromptBlank(prompt) {
  return /_{2,}|\bblank\b/i.test(String(prompt || ''));
}

function toIndexFromLetter(value) {
  const letter = toText(value).toUpperCase();
  if (letter.length !== 1) return null;
  if (letter < 'A' || letter > 'Z') return null;
  return letter.charCodeAt(0) - 65;
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

export function getChoiceList(question) {
  if (Array.isArray(question?.choices)) return question.choices;
  if (question?.choices && typeof question.choices === 'object') {
    return ['A', 'B', 'C', 'D']
      .map((key) => question.choices[key])
      .filter((value) => value != null);
  }
  return [];
}

export function resolveExplanationParts(question) {
  const explanation = parseMaybeObject(question?.explanation);
  const explanationString = toText(question?.explanation);
  const answer =
    toText(question?.correct_text) ||
    toText(question?.correct_answer) ||
    toText(question?.answer) ||
    toText(explanation?.answer) ||
    toText(question?.explanation_answer);
  const why =
    toText(explanation?.why) ||
    toText(question?.why) ||
    toText(question?.explanation_why) ||
    explanationString;
  const trap =
    toText(explanation?.trap) || toText(question?.trap) || toText(question?.explanation_trap);
  const hook =
    toText(explanation?.hook) || toText(question?.hook) || toText(question?.explanation_hook);

  return {
    answer,
    why,
    trap,
    hook,
  };
}

export function resolveCorrectChoiceIndex(question) {
  const choices = getChoiceList(question);
  if (choices.length === 0) return null;

  const explicitChoiceKeys = [question?.correct_choice, question?.answer_key, question?.correct_option];
  for (const key of explicitChoiceKeys) {
    const byLetter = toIndexFromLetter(key);
    if (byLetter != null && byLetter >= 0 && byLetter < choices.length) {
      return byLetter;
    }
    const byNumber = toIndexFromNumber(key, choices.length);
    if (byNumber != null) return byNumber;
  }

  const explicitIndices = [question?.correct_index, question?.correctIndex];
  for (const value of explicitIndices) {
    const parsed = toIndexFromNumber(value, choices.length);
    if (parsed != null) return parsed;
  }

  const fallbackTexts = [
    question?.correct_text,
    question?.correct_answer,
    question?.answer,
    question?.explanation?.answer,
    question?.explanation_answer,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (fallbackTexts.length === 0) return null;
  for (let i = 0; i < choices.length; i += 1) {
    const normalizedChoice = normalizeText(choices[i]);
    if (fallbackTexts.some((candidate) => candidate === normalizedChoice)) {
      return i;
    }
  }
  return null;
}

export function resolveCorrectAnswerText(question, resolvedCorrectChoiceText) {
  return (
    toText(resolvedCorrectChoiceText) ||
    toText(question?.correct_text) ||
    toText(question?.correct_answer) ||
    toText(question?.answer) ||
    toText(question?.explanation?.answer) ||
    toText(question?.explanation_answer)
  );
}

export function resolveQuestionMode(question) {
  const questionType = toText(question?.question_type || question?.type).toLowerCase();
  const choices = getChoiceList(question);
  const viableChoiceCount = choices.filter((choice) => toText(choice).length > 0).length;
  const hasCorrectText = toText(question?.correct_text).length > 0;

  if (questionType === 'fill') return 'fib';
  if (hasPromptBlank(question?.prompt)) return 'fib';
  if (hasCorrectText && viableChoiceCount < 2) return 'fib';
  if (viableChoiceCount >= 2) return 'mcq';
  return 'fib';
}

export function isFibAnswerCorrect(inputText, resolvedCorrectAnswerText) {
  return (
    normalizeFreeText(inputText) !== '' &&
    normalizeFreeText(inputText) === normalizeFreeText(resolvedCorrectAnswerText)
  );
}

export function resolveFibFeedbackState({
  questionMode,
  submitted,
  userInput,
  resolvedCorrectAnswerText,
}) {
  if (questionMode !== 'fib' || !submitted) return null;
  const isCorrect = isFibAnswerCorrect(userInput, resolvedCorrectAnswerText);
  return {
    isCorrect,
    label: isCorrect ? 'Correct' : 'Incorrect',
  };
}

export function resolveFibInputEnterIntent({ key, submitted }) {
  const normalizedKey = toText(key).toLowerCase();
  if (normalizedKey !== 'enter') return null;
  return submitted ? 'next' : 'submit';
}

export function resolveAnswerHotkeyChoicePosition({
  questionMode,
  key,
  visibleChoiceCount,
}) {
  const normalizedKey = toText(key).toLowerCase();
  if (questionMode !== 'mcq') return null;
  if (!['1', '2', '3', '4'].includes(normalizedKey)) return null;
  const nextChoice = Number(normalizedKey) - 1;
  if (nextChoice < 0 || nextChoice >= visibleChoiceCount) return null;
  return nextChoice;
}
