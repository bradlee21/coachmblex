import { accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_PACKS = [
  'src/content/packs/ch10-muscular-v1.json',
  'src/content/packs/ch10-muscular-v2.json',
  'src/content/packs/ch11-nervous-v1.json',
  'src/content/packs/ch12-endocrine-v1.json',
];

const OPTIONAL_PACKS = ['src/content/packs/ch13-cardio-blood-v1.json'];

function fileExists(relativePath) {
  try {
    accessSync(resolve(process.cwd(), relativePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseImportSummary(output) {
  const insertedMatch = output.match(/Inserted:\s*(\d+)/i);
  const skippedMatch = output.match(/Skipped\/invalid:\s*(\d+)/i);
  return {
    inserted: insertedMatch ? Number(insertedMatch[1]) : null,
    skipped: skippedMatch ? Number(skippedMatch[1]) : null,
  };
}

function runPackImport(packPath) {
  const scriptPath = resolve(process.cwd(), 'scripts/import-pack.mjs');
  const result = spawnSync(process.execPath, [scriptPath, packPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
  process.stdout.write(combinedOutput.endsWith('\n') ? combinedOutput : `${combinedOutput}\n`);

  if (result.status !== 0) {
    throw new Error(`Import failed for ${packPath}`);
  }

  return parseImportSummary(combinedOutput);
}

function main() {
  const queue = [...REQUIRED_PACKS];

  for (const optionalPack of OPTIONAL_PACKS) {
    if (fileExists(optionalPack)) {
      queue.push(optionalPack);
    } else {
      console.log(`Skipping missing optional pack: ${optionalPack}`);
    }
  }

  const summary = [];

  for (const packPath of queue) {
    if (!fileExists(packPath)) {
      console.error(`Required pack missing: ${packPath}`);
      process.exit(1);
    }

    console.log(`\n=== Importing ${packPath} ===`);
    const result = runPackImport(packPath);
    summary.push({
      packPath,
      inserted: result.inserted,
      skipped: result.skipped,
    });
  }

  console.log('\n=== Import All Packs Summary ===');
  for (const item of summary) {
    const inserted = item.inserted == null ? 'n/a' : item.inserted;
    const skipped = item.skipped == null ? 'n/a' : item.skipped;
    console.log(`${item.packPath}: inserted=${inserted} skipped=${skipped}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
