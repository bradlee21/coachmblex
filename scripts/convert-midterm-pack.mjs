import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT_FILE = resolve(
  process.cwd(),
  'src/content/packs/physiology-mid-term-replacements-v1.json'
);
const OUTPUT_FILE = resolve(
  process.cwd(),
  'src/content/packs/physiology-mid-term-replacements-v1.fixed.json'
);
const CHOICE_KEYS = ['A', 'B', 'C', 'D'];
const DEFAULT_BLUEPRINT_CODE = '2.D';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getPromptSnippet(prompt) {
  return toText(prompt).slice(0, 80);
}

function mapCorrectChoice(correctIndex) {
  const index = Number(correctIndex);
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    return '';
  }
  return CHOICE_KEYS[index];
}

function mapChoices(choices, questionNumber, prompt) {
  if (!Array.isArray(choices) || choices.length !== 4) {
    throw new Error(
      `Question ${questionNumber} must have exactly 4 choices. Prompt: "${getPromptSnippet(prompt)}"`
    );
  }
  return {
    A: choices[0],
    B: choices[1],
    C: choices[2],
    D: choices[3],
  };
}

function transformQuestion(question, index) {
  const questionNumber = index + 1;
  const explanation =
    question?.explanation && typeof question.explanation === 'object' && !Array.isArray(question.explanation)
      ? question.explanation
      : {};
  const correctChoice = mapCorrectChoice(question?.correct_index);
  if (!correctChoice) {
    throw new Error(
      `Question ${questionNumber} has invalid correct_index (${String(question?.correct_index)}). Prompt: "${getPromptSnippet(question?.prompt)}"`
    );
  }

  return {
    ...question,
    blueprint_code: toText(question?.blueprint_code) || DEFAULT_BLUEPRINT_CODE,
    choices: mapChoices(question?.choices, questionNumber, question?.prompt),
    correct_choice: correctChoice,
    answer: toText(explanation.answer),
    why: toText(explanation.why),
    trap: toText(explanation.trap),
    hook: toText(explanation.hook),
    explanation: undefined,
    correct_index: undefined,
  };
}

function cleanUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function main() {
  const raw = readFileSync(INPUT_FILE, 'utf8');
  const pack = JSON.parse(raw);
  const questions = Array.isArray(pack?.questions) ? pack.questions : [];

  const transformed = {
    ...pack,
    questions: questions.map((question, index) => cleanUndefined(transformQuestion(question, index))),
  };

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(transformed, null, 2)}\n`, 'utf8');
  console.log('WROTE', OUTPUT_FILE);
}

main();
