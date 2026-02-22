import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function assertMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

const appShellSource = read('app/AppShell.js');
const authProviderSource = read('src/providers/AuthProvider.js');
const todaySource = read('app/today/page.js');
const adminQuestionsSource = read('app/admin/questions/page.js');
const questionRunnerSource = read('app/_components/QuestionRunner.js');
const questionRunnerLogicSource = read('app/_components/questionRunnerLogic.mjs');
const importPackSource = read('scripts/import-pack.mjs');

assertMatch(
  appShellSource,
  /if\s*\(\s*loading\s*&&\s*isProtectedRoute\s*\)\s*{\s*return\s*<main className="auth-content">Loading session\.\.\.<\/main>;\s*}/s,
  'Expected protected-route loading gate to render "Loading session..." only when loading.'
);

assertMatch(
  appShellSource,
  /if\s*\(\s*!user\s*&&\s*isProtectedRoute\s*\)\s*{\s*return\s*<main className="auth-content">Redirecting to sign in\.\.\.<\/main>;\s*}/s,
  'Expected protected-route unauthenticated gate to redirect after loading resolves.'
);

assertMatch(
  authProviderSource,
  /setLoadingSafe\(false,\s*'loadSession\/finally'\);/,
  'Expected auth init path to clear loading in finally.'
);

assertMatch(
  authProviderSource,
  /setLoadingSafe\(false,\s*`auth-change\/\$\{event\}\/done`\);/,
  'Expected auth state change path to clear loading after role/profile sync.'
);

assertMatch(
  appShellSource,
  /href:\s*'\/admin\/questions'/,
  'Expected AppShell nav to include /admin/questions entry.'
);

assertMatch(
  appShellSource,
  /if\s*\(\s*normalizedRole\s*===\s*'questions_editor'\s*\)\s*{\s*return pathname === '\/admin\/questions' \|\| pathname\.startsWith\('\/admin\/questions\/'\);\s*}/s,
  'Expected questions_editor role to be limited to /admin/questions routes.'
);

assertMatch(
  appShellSource,
  /if\s*\(\s*isAdminRoute\s*&&\s*!hasAdminAccess\s*\)\s*{\s*return <main className="auth-content">You do not have access to this area\.<\/main>;\s*}/s,
  'Expected admin route guard to block unauthorized users with friendly message.'
);

assertMatch(
  authProviderSource,
  /\.from\('profiles'\)\s*\.select\('role'\)/s,
  'Expected AuthProvider to load profile role for route gating.'
);

assertMatch(
  appShellSource,
  /roles:\s*\['admin',\s*'questions_editor'\]/,
  'Expected Questions nav item to be visible only to admin and questions_editor roles.'
);

assertMatch(
  adminQuestionsSource,
  /<h1>Question Forge<\/h1>/,
  'Expected /admin/questions page to render Question Forge heading.'
);

assertMatch(
  todaySource,
  /<h1(?:\s+[^>]*)?>Today<\/h1>/,
  'Expected Today page to expose a stable heading for protected-route smoke checks.'
);

assertMatch(
  questionRunnerLogicSource,
  /export function\s+resolveCorrectChoiceIndex\s*\(/,
  'Expected questionRunnerLogic to include a resolved correct-choice helper.'
);

assertMatch(
  questionRunnerLogicSource,
  /question\?\.(correct_choice|answer_key|correct_option)/,
  'Expected correct-choice resolver to support letter/key variants.'
);

assertMatch(
  questionRunnerLogicSource,
  /question\?\.(correct_index|correctIndex)/,
  'Expected correct-choice resolver to support numeric index variants.'
);

assertMatch(
  questionRunnerSource,
  /resolveCorrectChoiceIndex\(current\)/,
  'Expected QuestionRunner to use shared resolveCorrectChoiceIndex helper.'
);

assertMatch(
  questionRunnerSource,
  /resolveExplanationDetails\(current,\s*resolvedCorrectAnswerText\)/,
  'Expected Answer line resolver to prefer resolved correct answer text.'
);

assertMatch(
  questionRunnerSource,
  /function\s+resolveQuestionMode\s*\(/,
  'Expected QuestionRunner to include a question mode resolver for MCQ vs fill.'
);

assertMatch(
  questionRunnerLogicSource,
  /if\s*\(\s*questionType\s*===\s*'fill'\s*\)\s*return\s*'fib';/,
  'Expected fill question_type to map to fib mode.'
);

assertMatch(
  questionRunnerSource,
  /resolveAnswerHotkeyChoicePosition\(\s*\{\s*questionMode,\s*key,\s*visibleChoiceCount:\s*visibleChoices\.length/s,
  'Expected QuestionRunner to route numeric hotkeys through resolver helper.'
);

assertMatch(
  questionRunnerLogicSource,
  /if\s*\(\s*questionMode\s*!==\s*'mcq'\s*\)\s*return\s*null;/,
  'Expected numeric answer hotkeys to be gated to MCQ mode.'
);

assertMatch(
  questionRunnerSource,
  /resolveFibInputEnterIntent\(\s*\{\s*key:\s*event\.key,\s*submitted,\s*}\s*\)/,
  'Expected fib input Enter handling to route through deterministic resolver helper.'
);

assertMatch(
  questionRunnerSource,
  /id="fib-answer"/,
  'Expected QuestionRunner fib mode to render a text input.'
);

assertMatch(
  questionRunnerSource,
  /submitAnswer\(\{\s*inputText:\s*userInput\s*}\)/,
  'Expected fib mode submit flow to grade typed input.'
);

assertMatch(
  questionRunnerSource,
  /(rawIndex|choiceIndex) === resolvedCorrectIndex/,
  'Expected QuestionRunner UI highlight to compare against resolvedCorrectIndex.'
);

assertMatch(
  importPackSource,
  /nestedExplanation[\s\S]*question\?\.explanation[\s\S]*typeof question\.explanation === 'object'/,
  'Expected pack importer to read nested explanation object fields.'
);

assertMatch(
  importPackSource,
  /why:\s*normalizeText\(question\.why \|\| nestedExplanation\.why/,
  'Expected pack importer to map explanation.why when top-level why is absent.'
);

console.log('Auth loading regression checks passed.');
