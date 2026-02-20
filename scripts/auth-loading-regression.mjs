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
  /setLoadingSafe\(false,\s*`auth-change\/\$\{event\}`\);/,
  'Expected auth state change path to clear loading immediately after login.'
);

assertMatch(
  todaySource,
  /<h1>Today<\/h1>/,
  'Expected Today page to expose a stable heading for protected-route smoke checks.'
);

console.log('Auth loading regression checks passed.');
