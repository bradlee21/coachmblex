import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const isCritical = process.argv.includes('--critical');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const missing = required.filter((name) => {
  const value = process.env[name];
  return !value || !value.trim();
});

if (missing.length > 0) {
  console.error('Missing required environment variables:');
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

function runNodeScript(path) {
  const result = spawnSync('node', [path], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript('scripts/study-night-smoke.mjs');
runNodeScript('scripts/auth-loading-regression.mjs');

if (isCritical) {
  console.log('Critical smoke checks passed.');
  process.exit(0);
}

const result = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
