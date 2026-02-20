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
const lobbySource = read('app/game/study-night/page.js');
const roomSource = read('app/game/study-night/room/[code]/page.js');

assertMatch(
  appShellSource,
  /pathname\?\.startsWith\('\/game'\)/,
  'Expected AppShell to treat /game routes as protected.'
);

assertMatch(
  appShellSource,
  /if\s*\(\s*loading\s*&&\s*isProtectedRoute\s*\)/,
  'Expected AppShell to keep protected-route loading gate.'
);

assertMatch(
  lobbySource,
  /<h1>Study Night<\/h1>/,
  'Expected Study Night lobby route to render its heading.'
);

assertMatch(
  roomSource,
  /<h1>Study Night Room \{room\.code\}<\/h1>/,
  'Expected Study Night room route to render room heading.'
);

assertMatch(
  roomSource,
  /Quickfire/,
  'Expected Study Night room route to render Quickfire phase.'
);

console.log('Study Night smoke checks passed.');
