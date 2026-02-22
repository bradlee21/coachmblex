import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function usageAndExit() {
  console.error('Usage: node scripts/validate-pack.mjs <path-to-pack.json>');
  process.exit(1);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateStringArray(value, fieldName, errors, { allowEmpty = true } = {}) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array of strings`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      errors.push(`${fieldName}[${index}] must be a string`);
      return;
    }
    if (!allowEmpty && item.trim() === '') {
      errors.push(`${fieldName}[${index}] must not be empty`);
    }
  });
}

function validateExplanation(explanation, errors) {
  if (explanation == null) return;
  if (!isPlainObject(explanation)) {
    errors.push('explanation must be an object');
    return;
  }
  for (const key of Object.keys(explanation)) {
    if (!['answer', 'why', 'trap', 'hook'].includes(key)) {
      errors.push(`explanation.${key} is not allowed in canonical model`);
      continue;
    }
    if (typeof explanation[key] !== 'string') {
      errors.push(`explanation.${key} must be a string`);
    }
  }
}

function validateQuestion(question, index) {
  const errors = [];
  const rowLabel = `question ${index + 1}`;

  if (!isPlainObject(question)) {
    return [`${rowLabel}: must be an object`];
  }

  if ('id' in question && typeof question.id !== 'string') {
    errors.push('id must be a string when present');
  }

  const prompt = toTrimmedString(question.prompt);
  if (!prompt) {
    errors.push('prompt is required and must be a non-empty string');
  }

  const type = toTrimmedString(question.type).toLowerCase();
  if (!['mcq', 'fib'].includes(type)) {
    errors.push('type is required and must be "mcq" or "fib"');
  }

  if (!isPlainObject(question.correct)) {
    errors.push('correct is required and must be an object');
  }

  if ('difficulty' in question) {
    if (!Number.isInteger(question.difficulty) || question.difficulty < 1 || question.difficulty > 5) {
      errors.push('difficulty must be an integer from 1 to 5');
    }
  }

  if ('sourcePack' in question && typeof question.sourcePack !== 'string') {
    errors.push('sourcePack must be a string');
  }
  if ('packId' in question && typeof question.packId !== 'string') {
    errors.push('packId must be a string');
  }

  validateStringArray(question.tags, 'tags', errors, { allowEmpty: false });
  validateStringArray(question.blueprintCodes, 'blueprintCodes', errors, { allowEmpty: false });
  validateExplanation(question.explanation, errors);

  if ('why' in question || 'trap' in question || 'hook' in question) {
    errors.push('use explanation.{why,trap,hook} instead of top-level why/trap/hook in canonical model');
  }

  if (type === 'mcq') {
    if (!Array.isArray(question.choices)) {
      errors.push('choices is required for mcq and must be an array');
    } else {
      if (question.choices.length < 2) {
        errors.push('choices must have at least 2 items for mcq');
      }
      question.choices.forEach((choice, choiceIndex) => {
        if (typeof choice !== 'string' || choice.trim() === '') {
          errors.push(`choices[${choiceIndex}] must be a non-empty string`);
        }
      });
    }

    if (!isPlainObject(question.correct)) {
      // already reported
    } else {
      const correctKeys = Object.keys(question.correct);
      if (!('index' in question.correct)) {
        errors.push('correct.index is required for mcq (canonical representation)');
      }
      if ('text' in question.correct) {
        errors.push('correct.text is not allowed for mcq in canonical model');
      }
      if (correctKeys.some((key) => !['index'].includes(key))) {
        errors.push('correct may only contain index for mcq');
      }
      if ('index' in question.correct) {
        if (!Number.isInteger(question.correct.index)) {
          errors.push('correct.index must be an integer for mcq');
        } else if (question.correct.index < 0) {
          errors.push('correct.index must be >= 0 for mcq');
        } else if (Array.isArray(question.choices) && question.correct.index >= question.choices.length) {
          errors.push('correct.index must be within choices array bounds for mcq');
        }
      }
    }
  }

  if (type === 'fib') {
    if ('choices' in question) {
      if (!Array.isArray(question.choices)) {
        errors.push('choices must be absent or an empty array for fib');
      } else if (question.choices.length > 0) {
        errors.push('choices must be absent or an empty array for fib');
      }
    }

    if (!isPlainObject(question.correct)) {
      // already reported
    } else {
      const correctKeys = Object.keys(question.correct);
      if (!('text' in question.correct)) {
        errors.push('correct.text is required for fib');
      }
      if ('index' in question.correct) {
        errors.push('correct.index is not allowed for fib');
      }
      if (correctKeys.some((key) => !['text'].includes(key))) {
        errors.push('correct may only contain text for fib');
      }
      if ('text' in question.correct && toTrimmedString(question.correct.text) === '') {
        errors.push('correct.text must be a non-empty string for fib');
      }
    }
  }

  return errors.map((message) => `${rowLabel}: ${message}`);
}

function main() {
  const fileArg = process.argv[2];
  if (!fileArg) usageAndExit();

  const filePath = resolve(process.cwd(), fileArg);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read/parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!isPlainObject(parsed)) {
    console.error('Pack must be a JSON object.');
    process.exit(1);
  }
  if (!Array.isArray(parsed.questions)) {
    console.error('Pack must include a questions[] array.');
    process.exit(1);
  }

  const allErrors = [];
  parsed.questions.forEach((question, index) => {
    allErrors.push(...validateQuestion(question, index));
  });

  if (allErrors.length > 0) {
    console.error(`Pack validation failed (${allErrors.length} issue${allErrors.length === 1 ? '' : 's'}):`);
    for (const error of allErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Pack validation passed: ${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'}.`
  );
}

main();
