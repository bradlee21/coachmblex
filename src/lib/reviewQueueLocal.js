const REVIEW_QUEUE_STORAGE_KEY_PREFIX = 'coachmblex_review_queue_v1';

function toQueueKey(userId) {
  return `${REVIEW_QUEUE_STORAGE_KEY_PREFIX}:${userId || 'anon'}`;
}

function normalizeQuestionIds(questionIds) {
  if (!Array.isArray(questionIds)) return [];
  const seen = new Set();
  const normalized = [];
  for (const value of questionIds) {
    if (value === null || value === undefined) continue;
    const key = String(value).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function readQueueRaw(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(toQueueKey(userId));
    if (!raw) return [];
    return normalizeQuestionIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadLocalReviewQueueIds(userId) {
  return readQueueRaw(userId);
}

export function addLocalReviewQueueIds(userId, questionIds) {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is not available.');
  }

  const existing = readQueueRaw(userId);
  const existingKeys = new Set(existing.map((id) => String(id)));
  const incoming = normalizeQuestionIds(questionIds);
  const next = [...existing];
  let addedCount = 0;

  for (const id of incoming) {
    if (existingKeys.has(id)) continue;
    existingKeys.add(id);
    next.push(id);
    addedCount += 1;
  }

  window.localStorage.setItem(toQueueKey(userId), JSON.stringify(next));
  return {
    addedCount,
    totalCount: next.length,
    key: toQueueKey(userId),
  };
}

export function removeLocalReviewQueueIds(userId, questionIds) {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is not available.');
  }

  const existing = readQueueRaw(userId);
  if (existing.length === 0) {
    return {
      removedCount: 0,
      totalCount: 0,
      key: toQueueKey(userId),
    };
  }

  const targetIds = new Set(normalizeQuestionIds(questionIds));
  if (targetIds.size === 0) {
    return {
      removedCount: 0,
      totalCount: existing.length,
      key: toQueueKey(userId),
    };
  }

  const next = existing.filter((id) => !targetIds.has(String(id)));
  const removedCount = existing.length - next.length;
  window.localStorage.setItem(toQueueKey(userId), JSON.stringify(next));

  return {
    removedCount,
    totalCount: next.length,
    key: toQueueKey(userId),
  };
}
