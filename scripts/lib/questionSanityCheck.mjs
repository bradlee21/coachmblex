const CHOICE_KEYS = ['A', 'B', 'C', 'D'];

const ORGAN_KEYWORDS = [
  'kidney',
  'heart',
  'liver',
  'lung',
  'stomach',
  'brain',
];

const SUBUNIT_KEYWORDS = [
  'nephron',
  'alveoli',
  'hepatocyte',
  'neuron',
  'atrium',
  'ventricle',
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
}

function includesWord(text, words) {
  return words.some((word) => text.includes(word));
}

function getAnswerText(question) {
  return normalizeText(question?.answer || question?.correct_text || question?.explanation?.answer);
}

export function validateQuestion(question) {
  const issues = [];
  const type = normalizeComparable(question?.question_type);
  const prompt = normalizeText(question?.prompt);
  const answerText = getAnswerText(question);

  if (prompt.length < 10) {
    issues.push('prompt_too_short');
  }
  if (answerText && answerText.length < 2) {
    issues.push('answer_too_short');
  }

  if (type === 'mcq' || type === 'reverse') {
    const choices = question?.choices;
    const normalizedChoicesByKey = {};

    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) {
      issues.push('choices_invalid');
    } else {
      for (const key of CHOICE_KEYS) {
        const value = normalizeText(choices[key]);
        normalizedChoicesByKey[key] = value;
        if (!value) {
          issues.push(`choice_${key}_empty`);
        }
      }

      const dedupeSet = new Set();
      let hasDuplicate = false;
      for (const key of CHOICE_KEYS) {
        const normalized = normalizeComparable(normalizedChoicesByKey[key]);
        if (!normalized) continue;
        if (dedupeSet.has(normalized)) {
          hasDuplicate = true;
          break;
        }
        dedupeSet.add(normalized);
      }
      if (hasDuplicate) {
        issues.push('duplicate_choices');
      }
    }

    const correctChoice = normalizeText(question?.correct_choice).toUpperCase();
    if (!CHOICE_KEYS.includes(correctChoice)) {
      issues.push('correct_choice_invalid');
    } else if (!normalizeText(choices?.[correctChoice])) {
      issues.push('correct_choice_missing_text');
    }

    if (answerText && CHOICE_KEYS.includes(correctChoice)) {
      const expectedChoice = normalizeComparable(choices?.[correctChoice]);
      const normalizedAnswer = normalizeComparable(answerText);
      const matches =
        expectedChoice &&
        normalizedAnswer &&
        (expectedChoice === normalizedAnswer ||
          expectedChoice.includes(normalizedAnswer) ||
          normalizedAnswer.includes(expectedChoice));
      if (!matches) {
        issues.push('answer_mismatch');
      }
    }

    const normalizedPrompt = normalizeComparable(prompt);
    const normalizedCorrectAnswer = normalizeComparable(choices?.[correctChoice]);
    const looksLikePartNotFunction =
      normalizedPrompt.includes('function') &&
      includesWord(normalizedPrompt, ORGAN_KEYWORDS) &&
      includesWord(normalizedCorrectAnswer, SUBUNIT_KEYWORDS);
    if (looksLikePartNotFunction) {
      issues.push('likely_part_not_function');
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
