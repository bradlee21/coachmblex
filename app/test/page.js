import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import TestCenterClient from './TestCenterClient';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function humanizePackId(packId) {
  return toText(packId)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function loadPackOptions() {
  const packsDir = path.join(process.cwd(), 'src', 'content', 'packs');
  let entries = [];
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const packFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== '.gitkeep')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const loaded = await Promise.all(
    packFiles.map(async (filename) => {
      const filePath = path.join(packsDir, filename);
      try {
        const raw = await readFile(filePath, 'utf8');
        const pack = JSON.parse(raw);
        const id =
          toText(pack?.pack_id) ||
          toText(pack?.packId) ||
          filename.replace(/\.json$/i, '');
        if (!id) return null;
        const title =
          toText(pack?.title) ||
          toText(pack?.topic) ||
          humanizePackId(id);
        return { id, title };
      } catch {
        return null;
      }
    })
  );

  return loaded
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export default async function TestPage() {
  const packs = await loadPackOptions();
  return <TestCenterClient packs={packs} />;
}
