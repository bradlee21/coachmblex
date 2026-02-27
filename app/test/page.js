import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import TestCenterClient from './TestCenterClient';
import {
  inferPackDomainCode,
  resolvePackDomainLabel,
} from '../../src/lib/packDomainMeta.mjs';

const ALLOWED_VISIBILITY = new Set(['active', 'archived', 'legacy', 'draft']);

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function humanizePackId(packId) {
  return toText(packId)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resolvePackId(pack, filename) {
  return (
    toText(pack?.pack_id) ||
    toText(pack?.packId) ||
    toText(pack?.id) ||
    toText(pack?.meta?.id) ||
    filename.replace(/\.json$/i, '')
  );
}

function resolveVisibility(pack) {
  const raw = toText(pack?.meta?.visibility).toLowerCase();
  if (!raw) return 'active';
  return ALLOWED_VISIBILITY.has(raw) ? raw : 'active';
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
        const id = resolvePackId(pack, filename);
        if (!id) return null;
        const source = toText(pack?.source);
        const visibility = resolveVisibility(pack);
        const title =
          toText(pack?.title) ||
          toText(pack?.topic) ||
          humanizePackId(id);
        const domainCode = inferPackDomainCode(pack, id);
        const domainLabel = resolvePackDomainLabel(pack, domainCode, title) || title;
        if (process.env.NODE_ENV !== 'production' && domainCode && !toText(domainLabel)) {
          console.warn(`Testing Center pack domainLabel is empty for ${id} (${domainCode})`);
        }
        return {
          id,
          title,
          domainCode,
          domainLabel,
          filename,
          source,
          visibility,
        };
      } catch {
        return null;
      }
    })
  );

  const visibleCandidates = loaded.filter((pack) => {
    if (!pack) return false;
    const filename = toText(pack.filename).toLowerCase();
    const source = toText(pack.source).toLowerCase();
    const visibility = toText(pack.visibility).toLowerCase() || 'active';
    if (visibility !== 'active' && visibility !== 'archived') return false;
    if (filename.includes('replacements') || filename.includes('patch')) return false;
    if (source.includes('replacements')) return false;
    return true;
  });

  const byId = new Map();
  const duplicateVisiblePackIds = new Set();
  for (const pack of visibleCandidates) {
    if (byId.has(pack.id)) {
      duplicateVisiblePackIds.add(pack.id);
      continue;
    }
    byId.set(pack.id, {
      id: pack.id,
      title: pack.title,
      domainCode: pack.domainCode || '',
      domainLabel: pack.domainLabel || pack.title || pack.id,
      visibility: pack.visibility,
    });
  }

  if (process.env.NODE_ENV !== 'production' && duplicateVisiblePackIds.size > 0) {
    console.warn(
      `Testing Center pack list duplicate visible packIds detected: ${Array.from(duplicateVisiblePackIds).join(', ')}`
    );
  }

  return Array.from(byId.values()).sort(
    (a, b) =>
      String(a.domainLabel || '').localeCompare(String(b.domainLabel || '')) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
  );
}

export default async function TestPage() {
  const packs = await loadPackOptions();
  return <TestCenterClient packs={packs} />;
}
