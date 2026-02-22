function usageAndExit(message = '') {
  if (message) {
    console.error(message);
    console.error('');
  }
  console.error('Usage: node scripts/new-question.mjs --type <mcq|fib> --prompt "..." --correct "..." [options]');
  console.error('');
  console.error('Options:');
  console.error('  --type mcq|fib               Required');
  console.error('  --prompt "text"              Required');
  console.error('  --choices "a|b|c|d"          Required for mcq');
  console.error('  --correct "0"                MCQ correct index (0-based)');
  console.error('  --correct "answer text"      FIB correct text');
  console.error('  --why "..."                  Optional explanation.why');
  console.error('  --trap "..."                 Optional explanation.trap');
  console.error('  --hook "..."                 Optional explanation.hook');
  console.error('  --answer "..."               Optional explanation.answer override');
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      usageAndExit(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) {
      usageAndExit(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildExplanation(args) {
  const explanation = {};
  if (toTrimmedString(args.answer)) explanation.answer = toTrimmedString(args.answer);
  if (toTrimmedString(args.why)) explanation.why = toTrimmedString(args.why);
  if (toTrimmedString(args.trap)) explanation.trap = toTrimmedString(args.trap);
  if (toTrimmedString(args.hook)) explanation.hook = toTrimmedString(args.hook);
  return Object.keys(explanation).length > 0 ? explanation : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const type = toTrimmedString(args.type).toLowerCase();
  const prompt = toTrimmedString(args.prompt);
  const rawCorrect = args.correct;

  if (!['mcq', 'fib'].includes(type)) {
    usageAndExit('--type must be "mcq" or "fib"');
  }
  if (!prompt) {
    usageAndExit('--prompt is required');
  }
  if (rawCorrect == null) {
    usageAndExit('--correct is required');
  }

  const question = {
    prompt,
    type,
  };

  if (type === 'mcq') {
    const choicesText = toTrimmedString(args.choices);
    if (!choicesText) {
      usageAndExit('--choices is required for mcq');
    }
    const choices = choicesText
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (choices.length < 2) {
      usageAndExit('MCQ requires at least 2 non-empty choices in --choices');
    }

    const correctIndex = Number(rawCorrect);
    if (!Number.isInteger(correctIndex)) {
      usageAndExit('MCQ --correct must be a 0-based integer index');
    }
    if (correctIndex < 0 || correctIndex >= choices.length) {
      usageAndExit(`MCQ --correct index must be between 0 and ${choices.length - 1}`);
    }

    question.choices = choices;
    question.correct = { index: correctIndex };
  } else {
    const correctText = toTrimmedString(rawCorrect);
    if (!correctText) {
      usageAndExit('FIB --correct must be a non-empty text value');
    }
    question.correct = { text: correctText };
  }

  const explanation = buildExplanation(args);
  if (explanation) {
    question.explanation = explanation;
  }

  process.stdout.write(`${JSON.stringify(question, null, 2)}\n`);
}

main();
