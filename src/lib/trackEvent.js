'use client';

import { postgrestFetch } from './postgrestFetch';
import { getSupabaseClient } from './supabaseClient';
import { devLog } from './devLog';

const MAX_EVENT_TYPE_LENGTH = 64;
const MAX_META_KEYS = 12;
const MAX_META_STRING_LENGTH = 80;
const BLOCKED_META_KEY_PATTERNS = [
  'prompt',
  'answer',
  'answers',
  'choice',
  'choices',
  'question',
  'text',
];

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};

  const sanitized = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(meta)) {
    if (count >= MAX_META_KEYS) break;
    const key = String(rawKey || '').trim().slice(0, 48);
    if (!key) continue;

    const lowerKey = key.toLowerCase();
    if (BLOCKED_META_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern))) {
      continue;
    }

    if (typeof rawValue === 'string') {
      const value = rawValue.trim().slice(0, MAX_META_STRING_LENGTH);
      if (!value) continue;
      sanitized[key] = value;
      count += 1;
      continue;
    }

    if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) continue;
      sanitized[key] = rawValue;
      count += 1;
      continue;
    }

    if (typeof rawValue === 'boolean') {
      sanitized[key] = rawValue;
      count += 1;
    }
  }

  return sanitized;
}

function toUserIdFromSession(session) {
  if (!session || typeof session !== 'object') return '';
  return String(session?.user?.id || '').trim();
}

export async function trackEvent(eventType, meta = {}) {
  try {
    const normalizedEventType = String(eventType || '').trim().slice(0, MAX_EVENT_TYPE_LENGTH);
    if (!normalizedEventType) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase.auth.getSession();
    const userId = toUserIdFromSession(data?.session);
    if (!userId) return;

    const response = await postgrestFetch('usage_events', {
      method: 'POST',
      body: {
        user_id: userId,
        event_type: normalizedEventType,
        meta: sanitizeMeta(meta),
      },
      headers: { prefer: 'return=minimal' },
    });

    if (!response.ok) {
      devLog('[TELEMETRY] trackEvent failed', normalizedEventType, response.status);
    }
  } catch (error) {
    devLog(
      '[TELEMETRY] trackEvent failed',
      String(eventType || ''),
      error instanceof Error ? error.message : String(error || '')
    );
  }
}
