'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../../../../src/lib/supabaseClient';
import { postgrestFetch } from '../../../../../src/lib/postgrestFetch';
import { devLog } from '../../../../../src/lib/devLog';
import { trackEvent } from '../../../../../src/lib/trackEvent';
import { useAuth } from '../../../../../src/providers/AuthProvider';
import {
  studyNightCategories,
  studyNightCategoryByKey,
} from '../../../../../src/game/studyNightCategories';

const DEFAULT_WIN_WEDGES = 3;
const DEFAULT_DURATION_SEC = 12;
const STUDY_NIGHT_GAME_TYPES = ['mcq', 'reverse', 'fill'];
const STUDY_NIGHT_DECK_SIZE = 25;
const REALTIME_RESYNC_THROTTLE_MS = 2000;
const STATE_PATCH_RETRY_DELAY_MS = 500;

const DEFAULT_STATE = {
  phase: 'pick',
  game_type: 'mcq',
  deck: {},
  deck_pos: {},
  turn_index: 0,
  category_key: null,
  question_id: null,
  started_at: null,
  duration_sec: DEFAULT_DURATION_SEC,
  round_no: 1,
};

function getRoomWinWedges(room) {
  const value = Number(room?.win_wedges);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_WIN_WEDGES;
}

function getRoomDurationSec(room) {
  const value = Number(room?.duration_sec);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DURATION_SEC;
}

function normalizeGameTypeMode(value) {
  return value === 'roulette' ? 'roulette' : 'pick';
}

function chooseRouletteGameType(lastGameType, availableTypes = STUDY_NIGHT_GAME_TYPES) {
  const options = availableTypes
    .map((type) => normalizeGameType(type))
    .filter((type, index, list) => STUDY_NIGHT_GAME_TYPES.includes(type) && list.indexOf(type) === index);
  if (options.length === 0) return '';
  const previous = normalizeGameType(lastGameType);
  let next = options[Math.floor(Math.random() * options.length)];

  if (options.length > 1 && next === previous) {
    const alternatives = options.filter((option) => option !== previous);
    next = alternatives[Math.floor(Math.random() * alternatives.length)];
  }

  return next;
}

function getDeckKey(categoryKey, gameType) {
  return `${categoryKey}:${normalizeGameType(gameType)}`;
}

function toDeckMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const deck = {};
  for (const [key, ids] of Object.entries(value)) {
    deck[key] = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  }
  return deck;
}

function toDeckPosMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const deckPos = {};
  for (const [key, pos] of Object.entries(value)) {
    const numeric = Number(pos);
    deckPos[key] = Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
  }
  return deckPos;
}

function buildDeckCountsMap(deckValue) {
  const deck = toDeckMap(deckValue);
  const counts = {};
  for (const category of studyNightCategories) {
    for (const gameType of STUDY_NIGHT_GAME_TYPES) {
      const key = getDeckKey(category.key, gameType);
      counts[key] = Array.isArray(deck[key]) ? deck[key].length : 0;
    }
  }
  return counts;
}

function getDeckBucketCount(deckCounts, categoryKey, gameType) {
  if (!categoryKey) return 0;
  const key = getDeckKey(categoryKey, gameType);
  const value = Number(deckCounts?.[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getAvailableDeckGameTypes(deckValue, categoryKey) {
  if (!categoryKey) return [];
  const deck = toDeckMap(deckValue);
  return STUDY_NIGHT_GAME_TYPES.filter((gameType) => {
    const key = getDeckKey(categoryKey, gameType);
    const ids = deck[key];
    return Array.isArray(ids) && ids.length > 0;
  });
}

function getTurnKey(roomId, state) {
  if (!roomId || !state) return '';
  return `${roomId}:${state.round_no || 0}:${state.turn_index || 0}:${state.question_id || 'none'}`;
}

function getMissPrefix(blueprintCode) {
  if (typeof blueprintCode !== 'string' || !blueprintCode.trim()) return '';
  const parts = blueprintCode.split('.').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] || '';
}

function createEmptyCoachStats() {
  return {
    totalAnswered: 0,
    correct: 0,
    incorrect: 0,
    missesByPrefix: {},
  };
}

function normalizeCoachStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const totalAnswered = Math.max(0, Math.floor(Number(value.totalAnswered) || 0));
  const correct = Math.max(0, Math.floor(Number(value.correct) || 0));
  const incorrect = Math.max(0, Math.floor(Number(value.incorrect) || 0));
  const missesByPrefix = {};
  if (value.missesByPrefix && typeof value.missesByPrefix === 'object' && !Array.isArray(value.missesByPrefix)) {
    for (const [prefix, count] of Object.entries(value.missesByPrefix)) {
      const normalizedCount = Math.floor(Number(count) || 0);
      if (!prefix || normalizedCount <= 0) continue;
      missesByPrefix[prefix] = normalizedCount;
    }
  }
  return {
    totalAnswered,
    correct,
    incorrect,
    missesByPrefix,
  };
}

function getPlayerCoachStats(player, coachStatsByUser) {
  const persisted = normalizeCoachStats(player?.coach_stats);
  if (persisted) return persisted;
  const inMemory = normalizeCoachStats(player?.user_id ? coachStatsByUser[player.user_id] : null);
  return inMemory || createEmptyCoachStats();
}

function getTopMissEntry(missesByPrefix) {
  const entries = Object.entries(missesByPrefix || {});
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [prefix, count] = entries[0];
  return { prefix, count };
}

function getNextPickSuggestions(missesByPrefix, ownedKeys) {
  const owned = new Set(Array.isArray(ownedKeys) ? ownedKeys : []);
  const unearned = studyNightCategories.filter((category) => !owned.has(category.key));
  const sortedMisses = Object.entries(missesByPrefix || {}).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const picks = [];
  const used = new Set();

  for (const [prefix] of sortedMisses) {
    const match = unearned.find(
      (category) => !used.has(category.key) && prefix.startsWith(category.prefix)
    );
    if (!match) continue;
    picks.push(match);
    used.add(match.key);
    if (picks.length >= 2) break;
  }

  if (picks.length < 2) {
    for (const category of unearned) {
      if (used.has(category.key)) continue;
      picks.push(category);
      used.add(category.key);
      if (picks.length >= 2) break;
    }
  }

  return picks;
}

function normalizeGameType(value) {
  if (value === 'reverse') return 'reverse';
  if (value === 'fill') return 'fill';
  return 'mcq';
}

function getGameTypeLabel(value) {
  const normalized = normalizeGameType(value);
  if (normalized === 'reverse') return 'Reverse';
  if (normalized === 'fill') return 'Fill';
  return 'MCQ';
}

function normalizeAnswerText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getCorrectAnswerText(question) {
  if (!question || typeof question !== 'object') return '';
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const answerFromChoice = choices[question.correct_index];
  if (typeof answerFromChoice === 'string' && answerFromChoice.trim()) {
    return answerFromChoice.trim();
  }

  if (typeof question.explanation === 'string' && question.explanation.trim()) {
    return question.explanation.trim();
  }

  if (
    question.explanation &&
    typeof question.explanation === 'object' &&
    typeof question.explanation.answer === 'string' &&
    question.explanation.answer.trim()
  ) {
    return question.explanation.answer.trim();
  }
  return '';
}

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    const aTime = new Date(a.joined_at || 0).getTime();
    const bTime = new Date(b.joined_at || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return String(a.id).localeCompare(String(b.id));
  });
}

function getDisplayName(player) {
  if (player?.display_name && player.display_name.trim()) return player.display_name.trim();
  if (player?.user_id) return player.user_id.slice(0, 8);
  return 'Player';
}

function getWedges(player) {
  if (Array.isArray(player?.wedges)) {
    return player.wedges.filter((item) => typeof item === 'string');
  }
  return [];
}

function getCategoryLabelByKey(key) {
  const category = studyNightCategoryByKey[key];
  if (category) return `${category.key}. ${category.label}`;
  return `Category ${key}`;
}

function getExplanationBlocks(explanation) {
  if (!explanation) return [];
  if (typeof explanation === 'string') {
    return [{ label: 'Why', text: explanation }];
  }
  if (typeof explanation !== 'object') return [];

  const keys = [
    ['answer', 'Answer'],
    ['why', 'Why'],
    ['trap', 'Trap'],
    ['hook', 'Hook'],
  ];

  return keys
    .map(([key, label]) => ({ label, text: explanation[key] }))
    .filter((item) => typeof item.text === 'string' && item.text.trim());
}

function getDefaultDisplayName(user) {
  const fromMeta =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  if (typeof user?.email === 'string' && user.email.includes('@')) {
    return user.email.split('@')[0];
  }
  return 'Player';
}

function toErrorInfo(error, fallbackMessage = 'Unexpected error.') {
  return {
    message:
      typeof error?.message === 'string' && error.message.trim() ? error.message : fallbackMessage,
    details: typeof error?.details === 'string' ? error.details : '',
    hint: typeof error?.hint === 'string' ? error.hint : '',
    code:
      typeof error?.code === 'string' || typeof error?.code === 'number'
        ? String(error.code)
        : '',
    status:
      typeof error?.status === 'string' || typeof error?.status === 'number'
        ? String(error.status)
        : '',
  };
}

function withTimeout(promise, ms = 8000, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function toPostgrestError(response, fallbackMessage) {
  const payload =
    response && response.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : null;
  return {
    message: payload?.message || response?.errorText || fallbackMessage,
    details: payload?.details || '',
    hint: payload?.hint || '',
    code: payload?.code ? String(payload.code) : '',
    status:
      typeof response?.status === 'number' || typeof response?.status === 'string'
        ? String(response.status)
        : '',
  };
}

async function timedPostgrest(path, options, label) {
  return withTimeout(postgrestFetch(path, options), 8000, label);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryTransientMutationResponse(response) {
  if (!response || response.ok) return false;
  if (Number(response.status) === 0) return true;
  const errorText = String(response.errorText || '').toLowerCase();
  return (
    errorText.includes('failed to fetch') ||
    errorText.includes('networkerror') ||
    errorText.includes('network request failed')
  );
}

function shouldRetryTransientMutationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('timed out')
  );
}

async function patchStudyRoomStateWithRetry(path, body, label, options = {}) {
  const onMutation = typeof options.onMutation === 'function' ? options.onMutation : null;
  if (onMutation) {
    onMutation({
      name: label,
      at: Date.now(),
      ok: null,
      status: '',
      message: 'running',
    });
  }

  try {
    const firstAttempt = await timedPostgrest(
      path,
      {
        method: 'PATCH',
        body,
      },
      label
    );

    if (!shouldRetryTransientMutationResponse(firstAttempt)) {
      if (onMutation) {
        onMutation({
          name: label,
          at: Date.now(),
          ok: Boolean(firstAttempt.ok),
          status: firstAttempt.status,
          message: firstAttempt.ok ? 'ok' : (firstAttempt.errorText || 'request failed'),
        });
      }
      return firstAttempt;
    }

    devLog('[STUDY-NIGHT] transient state patch response, retrying once', label, firstAttempt.status);
    await delay(STATE_PATCH_RETRY_DELAY_MS);
    const retryAttempt = await timedPostgrest(
      path,
      {
        method: 'PATCH',
        body,
      },
      `${label}_retry`
    );
    if (onMutation) {
      onMutation({
        name: label,
        at: Date.now(),
        ok: Boolean(retryAttempt.ok),
        status: retryAttempt.status,
        message: retryAttempt.ok ? 'ok_after_retry' : (retryAttempt.errorText || 'retry failed'),
      });
    }
    return retryAttempt;
  } catch (error) {
    if (onMutation) {
      onMutation({
        name: label,
        at: Date.now(),
        ok: false,
        status: 0,
        message: String(error?.message || 'request error'),
      });
    }
    if (!shouldRetryTransientMutationError(error)) {
      throw error;
    }

    devLog('[STUDY-NIGHT] transient state patch error, retrying once', label, error);
    await delay(STATE_PATCH_RETRY_DELAY_MS);
    const retryAttempt = await timedPostgrest(
      path,
      {
        method: 'PATCH',
        body,
      },
      `${label}_retry`
    );
    if (onMutation) {
      onMutation({
        name: label,
        at: Date.now(),
        ok: Boolean(retryAttempt.ok),
        status: retryAttempt.status,
        message: retryAttempt.ok ? 'ok_after_retry' : (retryAttempt.errorText || 'retry failed'),
      });
    }
    return retryAttempt;
  }
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : null;
}

async function ensureRoomMembership(roomId, user) {
  const nowIso = new Date().toISOString();
  const insertResponse = await timedPostgrest(
    'study_room_players',
    {
      method: 'POST',
      body: {
        room_id: roomId,
        user_id: user.id,
        display_name: getDefaultDisplayName(user),
        last_seen_at: nowIso,
      },
      headers: { prefer: 'return=representation' },
    },
    'room_membership_insert'
  );

  if (insertResponse.ok) return;

  const insertError = toPostgrestError(insertResponse, 'Failed to join room.');
  if (!(insertResponse.status === 409 || insertError.code === '23505')) {
    throw insertError;
  }

  const updateResponse = await timedPostgrest(
    `study_room_players?room_id=eq.${roomId}&user_id=eq.${user.id}`,
    {
      method: 'PATCH',
      body: { last_seen_at: nowIso },
    },
    'room_membership_update'
  );
  if (!updateResponse.ok) {
    throw toPostgrestError(updateResponse, 'Failed to refresh room membership.');
  }
}

export default function StudyNightRoomPage() {
  const params = useParams();
  const router = useRouter();
  const codeParam = Array.isArray(params?.code) ? params.code[0] : params?.code;
  const roomCode = String(codeParam || '').toUpperCase();
  const { user, loading: authLoading } = useAuth();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState(null);
  const [question, setQuestion] = useState(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [message, setMessage] = useState('');
  const [loadErrorInfo, setLoadErrorInfo] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState({});
  const [fillInputByQuestion, setFillInputByQuestion] = useState({});
  const [submittedByQuestion, setSubmittedByQuestion] = useState({});
  const [correctByQuestion, setCorrectByQuestion] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selectedGameType, setSelectedGameType] = useState('mcq');
  const [confirmResetRoom, setConfirmResetRoom] = useState(false);
  const [deckCountsByKey, setDeckCountsByKey] = useState({});
  const [deckHealthCategoryKey, setDeckHealthCategoryKey] = useState(studyNightCategories[0]?.key || '');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('idle');
  const [lastSnapshotAt, setLastSnapshotAt] = useState(0);
  const [lastMutation, setLastMutation] = useState(null);

  const channelRef = useRef(null);
  const revealKeyRef = useRef('');
  const scoreBaselineRef = useRef({});
  const rejoinSyncRef = useRef(false);
  const refreshInFlightRef = useRef(null);
  const lastRealtimeResyncAtRef = useRef(0);
  const finishedEventKeyRef = useRef('');
  const submittedTurnKeysRef = useRef({});
  const gradedTurnKeysRef = useRef({});
  const coachStatsRef = useRef({});
  const [coachStatsVersion, setCoachStatsVersion] = useState(0);

  const orderedPlayers = useMemo(() => sortPlayers(players), [players]);
  const playerCount = orderedPlayers.length;
  const turnIndex = state?.turn_index || 0;
  const currentTurnPlayer = playerCount > 0 ? orderedPlayers[turnIndex % playerCount] : null;
  const myPlayer = orderedPlayers.find((player) => player.user_id === user?.id) || null;
  const myWedges = getWedges(myPlayer);
  const isHost = Boolean(user?.id && room?.host_user_id === user.id);
  const isCurrentTurn = Boolean(user?.id && currentTurnPlayer?.user_id === user.id);
  const isMyTurn = isCurrentTurn;
  const gameTypeMode = normalizeGameTypeMode(room?.game_type_mode);
  const isRouletteMode = gameTypeMode === 'roulette';
  const canPickCategory =
    room?.status === 'running' && state?.phase === 'pick' && Boolean(currentTurnPlayer) && (isCurrentTurn || isHost);
  const activePlayersCount = useMemo(() => {
    const activeAfterMs = Date.now() - 60000;
    return orderedPlayers.filter((player) => {
      const seenAtMs = new Date(player.last_seen_at || 0).getTime();
      return seenAtMs >= activeAfterMs;
    }).length;
  }, [orderedPlayers]);

  const refreshRoomSnapshot = useCallback((roomId) => {
    if (!roomId) return Promise.resolve();
    if (refreshInFlightRef.current?.roomId === roomId) {
      return refreshInFlightRef.current.promise;
    }

    const refreshPromise = (async () => {
      const [roomResult, playerResult, stateResult] = await Promise.all([
        timedPostgrest(
          `study_rooms?id=eq.${roomId}&select=id,code,host_user_id,status,game_type_mode,win_wedges,duration_sec,question_count,created_at&limit=1`,
          undefined,
          'snapshot_room'
        ),
        timedPostgrest(
          `study_room_players?room_id=eq.${roomId}&select=id,room_id,user_id,display_name,score,wedges,coach_stats,joined_at,last_seen_at&order=joined_at.asc`,
          undefined,
          'snapshot_players'
        ),
        timedPostgrest(
          `study_room_state?room_id=eq.${roomId}&select=room_id,turn_index,phase,game_type,deck,deck_pos,category_key,question_id,started_at,duration_sec,round_no,updated_at&limit=1`,
          undefined,
          'snapshot_state'
        ),
      ]);

      if (!roomResult.ok) throw toPostgrestError(roomResult, 'Failed to load room.');
      if (!playerResult.ok) throw toPostgrestError(playerResult, 'Failed to load players.');
      if (!stateResult.ok) throw toPostgrestError(stateResult, 'Failed to load room state.');

      const nextRoom = firstRow(roomResult.data);
      const nextPlayers = Array.isArray(playerResult.data) ? playerResult.data : [];
      const nextState = firstRow(stateResult.data);

      setRoom(nextRoom);
      setPlayers(nextPlayers);
      setState(nextState);

      if (nextState?.question_id) {
        const questionResult = await timedPostgrest(
          `questions?id=eq.${nextState.question_id}&select=id,prompt,choices,correct_index,explanation,blueprint_code,question_type&limit=1`,
          undefined,
          'snapshot_question'
        );
        if (!questionResult.ok) {
          throw toPostgrestError(questionResult, 'Failed to load question.');
        }
        const questionRow = firstRow(questionResult.data);
        setQuestion(questionRow || null);

        if (!scoreBaselineRef.current[nextState.question_id]) {
          scoreBaselineRef.current[nextState.question_id] = Object.fromEntries(
            nextPlayers.map((player) => [player.user_id, player.score || 0])
          );
        }
      } else {
        setQuestion(null);
      }

      setLastSnapshotAt(Date.now());
    })()
      .finally(() => {
        if (refreshInFlightRef.current?.promise === refreshPromise) {
          refreshInFlightRef.current = null;
        }
      });

    refreshInFlightRef.current = {
      roomId,
      promise: refreshPromise,
    };
    return refreshPromise;
  }, []);

  const buildRoomDeck = useCallback(async () => {
    const entries = await Promise.all(
      studyNightCategories.flatMap((category) =>
        STUDY_NIGHT_GAME_TYPES.map(async (gameType) => {
          const key = getDeckKey(category.key, gameType);
          const labelKey = key.replace(':', '_');
          const response = await timedPostgrest(
            `questions?select=id&question_type=eq.${gameType}&blueprint_code=like.${encodeURIComponent(
              `${category.prefix}%`
            )}&order=id.asc&limit=${STUDY_NIGHT_DECK_SIZE}`,
            undefined,
            `build_deck_${labelKey}`
          );

          if (!response.ok) {
            devLog('[STUDY-NIGHT] build deck fetch failed', key, response);
            return [key, []];
          }

          const ids = (Array.isArray(response.data) ? response.data : [])
            .map((row) => row?.id)
            .filter((id) => typeof id === 'string');
          return [key, ids];
        })
      )
    );

    const deck = {};
    const deckPos = {};
    const deckCounts = {};
    for (const [key, ids] of entries) {
      deck[key] = ids;
      deckPos[key] = 0;
      deckCounts[key] = Array.isArray(ids) ? ids.length : 0;
    }

    return { deck, deckPos, deckCounts };
  }, []);

  const recordTurnStats = useCallback(async (playerUserId, wasCorrect, blueprintCode) => {
    if (!playerUserId) return;
    const persistedFromPlayers = normalizeCoachStats(
      players.find((player) => player.user_id === playerUserId)?.coach_stats
    );
    const previous =
      normalizeCoachStats(coachStatsRef.current[playerUserId]) ||
      persistedFromPlayers ||
      createEmptyCoachStats();
    const next = {
      totalAnswered: previous.totalAnswered + 1,
      correct: previous.correct + (wasCorrect ? 1 : 0),
      incorrect: previous.incorrect + (wasCorrect ? 0 : 1),
      missesByPrefix: { ...(previous.missesByPrefix || {}) },
    };

    if (!wasCorrect) {
      const missPrefix = getMissPrefix(blueprintCode);
      if (missPrefix) {
        next.missesByPrefix[missPrefix] = (next.missesByPrefix[missPrefix] || 0) + 1;
      }
    }

    coachStatsRef.current = {
      ...coachStatsRef.current,
      [playerUserId]: next,
    };
    setCoachStatsVersion((value) => value + 1);

    if (!room?.id || (!isHost && user?.id !== playerUserId)) return;

    const updateResponse = await timedPostgrest(
      `study_room_players?room_id=eq.${room.id}&user_id=eq.${playerUserId}`,
      {
        method: 'PATCH',
        body: { coach_stats: next },
      },
      'coach_stats_update'
    );
    if (!updateResponse.ok) {
      devLog('[STUDY-NIGHT] coach_stats update failed', {
        roomId: room.id,
        playerUserId,
        status: updateResponse.status,
        error: updateResponse.errorText,
      });
    }
  }, [isHost, players, room?.id, user?.id]);

  const pickCategoryAsHost = useCallback(
    async (categoryKey, gameType = 'mcq') => {
      if (!isHost || !room || room.status !== 'running' || state?.phase !== 'pick') return;

      const category = studyNightCategoryByKey[categoryKey];
      const gameTypeMode = normalizeGameTypeMode(room.game_type_mode);
      if (!category) {
        setMessage('Invalid category.');
        return;
      }

      try {
        const deck = toDeckMap(state?.deck);
        const deckPos = toDeckPosMap(state?.deck_pos);
        let normalizedGameType = normalizeGameType(gameType);

        if (gameTypeMode === 'roulette') {
          const availableTypes = getAvailableDeckGameTypes(deck, category.key);
          if (availableTypes.length === 0) {
            setMessage('No questions available for this category yet.');
            return;
          }
          normalizedGameType = chooseRouletteGameType(state?.game_type, availableTypes);
          if (!normalizedGameType) {
            setMessage('No questions available for this category yet.');
            return;
          }
        }

        const deckKey = getDeckKey(category.key, normalizedGameType);
        const deckIds = Array.isArray(deck[deckKey]) ? deck[deckKey] : [];
        let nextDeckPos = null;
        let nextQuestion = null;

        if (deckIds.length > 0) {
          const pos = typeof deckPos[deckKey] === 'number' ? deckPos[deckKey] : 0;
          const deckQuestionId = deckIds[pos % deckIds.length];
          if (deckQuestionId) {
            const deckQuestionResult = await timedPostgrest(
              `questions?id=eq.${deckQuestionId}&select=id,prompt,choices,correct_index,explanation,blueprint_code,question_type&limit=1`,
              undefined,
              'pick_question_deck'
            );
            if (deckQuestionResult.ok) {
              nextQuestion = firstRow(deckQuestionResult.data);
              if (nextQuestion) {
                nextDeckPos = {
                  ...deckPos,
                  [deckKey]: pos + 1,
                };
              }
            } else {
              devLog('[STUDY-NIGHT] deck question fallback triggered', deckKey, deckQuestionResult);
            }
          }
        }

        if (!nextQuestion) {
          const offset = Math.max(0, (state?.round_no || 1) % 10);
          let questionResult = await timedPostgrest(
            `questions?select=id,prompt,choices,correct_index,explanation,blueprint_code,question_type&question_type=eq.${normalizedGameType}&blueprint_code=like.${encodeURIComponent(
              `${category.prefix}%`
            )}&order=id.asc&offset=${offset}&limit=1`,
            undefined,
            'pick_question_offset'
          );
          if (!questionResult.ok) {
            throw toPostgrestError(questionResult, 'Failed to load category question.');
          }
          nextQuestion = firstRow(questionResult.data);
          if (!nextQuestion) {
            questionResult = await timedPostgrest(
              `questions?select=id,prompt,choices,correct_index,explanation,blueprint_code,question_type&question_type=eq.${normalizedGameType}&blueprint_code=like.${encodeURIComponent(
                `${category.prefix}%`
              )}&order=id.asc&offset=0&limit=1`,
              undefined,
              'pick_question_fallback'
            );
            if (!questionResult.ok) {
              throw toPostgrestError(questionResult, 'Failed to load fallback category question.');
            }
            nextQuestion = firstRow(questionResult.data);
          }
        }

        if (!nextQuestion) {
          setMessage(`No ${getGameTypeLabel(normalizedGameType)} question found for category ${category.key}.`);
          return;
        }

        scoreBaselineRef.current[nextQuestion.id] = Object.fromEntries(
          orderedPlayers.map((player) => [player.user_id, player.score || 0])
        );

        const stateUpdateResult = await patchStudyRoomStateWithRetry(
          `study_room_state?room_id=eq.${room.id}`,
          {
            phase: 'question',
            game_type: normalizedGameType,
            category_key: category.key,
            question_id: nextQuestion.id,
            started_at: new Date().toISOString(),
            ...(nextDeckPos ? { deck_pos: nextDeckPos } : {}),
          },
          'pick_update_state',
          { onMutation: setLastMutation }
        );

        if (!stateUpdateResult.ok) {
          throw toPostgrestError(stateUpdateResult, 'Failed to set question phase.');
        }
        setMessage('');
        await refreshRoomSnapshot(room.id);
      } catch (error) {
        const nextMessage = error instanceof Error ? error.message : 'Failed to load question.';
        setMessage(nextMessage);
      }
    },
    [
      isHost,
      orderedPlayers,
      refreshRoomSnapshot,
      room,
      state?.phase,
      state?.round_no,
      state?.game_type,
      state?.deck,
      state?.deck_pos,
    ]
  );

  const movePhaseToReveal = useCallback(async () => {
    if (!isHost || !room || state?.phase !== 'question') return;

    const response = await patchStudyRoomStateWithRetry(
      `study_room_state?room_id=eq.${room.id}`,
      {
        phase: 'reveal',
        started_at: null,
      },
      'question_to_reveal',
      { onMutation: setLastMutation }
    );

    if (!response.ok) {
      const error = toPostgrestError(response, 'Failed to move to reveal.');
      setMessage(error.message);
      return;
    }

    await refreshRoomSnapshot(room.id);
  }, [isHost, refreshRoomSnapshot, room, state?.phase]);

  useEffect(() => {
    async function loadRoom() {
      if (!user || !roomCode) return;
      const supabase = getSupabaseClient();
      if (!supabase) {
        setLoadingRoom(false);
        setLoadErrorInfo(toErrorInfo({ message: 'Supabase is not configured.' }));
        return;
      }

      setLoadingRoom(true);
      setMessage('');
      setLoadErrorInfo(null);

      try {
        const roomResponse = await timedPostgrest(
          `study_rooms?code=eq.${encodeURIComponent(
            roomCode
          )}&select=id,code,host_user_id,status,game_type_mode,win_wedges,duration_sec,question_count,created_at&limit=1`,
          undefined,
          'load_room_by_code'
        );
        if (!roomResponse.ok) {
          throw toPostgrestError(roomResponse, 'Failed to load room by code.');
        }
        const roomRow = firstRow(roomResponse.data);
        if (!roomRow) {
          setLoadErrorInfo(toErrorInfo({ message: 'Room not found.' }));
          setRoom(null);
          setPlayers([]);
          setState(null);
          setQuestion(null);
          return;
        }

        await ensureRoomMembership(roomRow.id, user);

        await refreshRoomSnapshot(roomRow.id);
      } catch (error) {
        devLog('[STUDY-NIGHT] room load failed', error);
        setLoadErrorInfo(toErrorInfo(error, 'Failed to load room.'));
      } finally {
        setLoadingRoom(false);
      }
    }

    if (!authLoading) {
      void loadRoom();
    }
  }, [authLoading, refreshRoomSnapshot, roomCode, user]);

  useEffect(() => {
    if (!room?.id || !user?.id) return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    const channel = supabase.channel(`study-night-${room.id}`);
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_rooms',
          filter: `id=eq.${room.id}`,
        },
        () => {
          void refreshRoomSnapshot(room.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_room_players',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          void refreshRoomSnapshot(room.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_room_state',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          void refreshRoomSnapshot(room.id);
        }
      )
      .on('broadcast', { event: 'category-pick' }, ({ payload }) => {
        if (!isHost || !payload || payload.roomId !== room.id) return;
        if (state?.phase !== 'pick') return;
        if (!currentTurnPlayer) return;
        if (
          payload.userId !== currentTurnPlayer.user_id &&
          payload.userId !== room.host_user_id
        ) {
          return;
        }
        void pickCategoryAsHost(payload.categoryKey, payload.gameType);
      })
      .subscribe((status) => {
        setRealtimeStatus(String(status || 'unknown'));
        if (status !== 'SUBSCRIBED') return;
        const now = Date.now();
        if (now - lastRealtimeResyncAtRef.current < REALTIME_RESYNC_THROTTLE_MS) return;
        lastRealtimeResyncAtRef.current = now;
        void refreshRoomSnapshot(room.id);
      });

    return () => {
      channelRef.current = null;
      setRealtimeStatus('CLOSED');
      void supabase.removeChannel(channel);
    };
  }, [
    currentTurnPlayer,
    isHost,
    pickCategoryAsHost,
    refreshRoomSnapshot,
    room,
    state?.phase,
    user?.id,
  ]);

  useEffect(() => {
    if (state?.phase === 'pick') {
      setSelectedGameType('mcq');
    }
  }, [state?.phase, state?.round_no]);

  useEffect(() => {
    setDeckCountsByKey(buildDeckCountsMap(state?.deck));
  }, [state?.deck]);

  useEffect(() => {
    if (!state?.category_key) return;
    if (!studyNightCategoryByKey[state.category_key]) return;
    setDeckHealthCategoryKey(state.category_key);
  }, [state?.category_key]);

  useEffect(() => {
    if (studyNightCategoryByKey[deckHealthCategoryKey]) return;
    setDeckHealthCategoryKey(studyNightCategories[0]?.key || '');
  }, [deckHealthCategoryKey]);

  useEffect(() => {
    if (!room?.id) return;
    coachStatsRef.current = {};
    gradedTurnKeysRef.current = {};
    setCoachStatsVersion((value) => value + 1);
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id || !user?.id || loadingRoom) return undefined;
    if (orderedPlayers.some((player) => player.user_id === user.id)) return undefined;
    if (rejoinSyncRef.current) return undefined;

    rejoinSyncRef.current = true;
    let isMounted = true;

    async function ensureMembershipAfterRefresh() {
      try {
        await ensureRoomMembership(room.id, user);
        if (isMounted) {
          await refreshRoomSnapshot(room.id);
        }
      } catch (error) {
        devLog('[STUDY-NIGHT] rejoin membership sync failed', error);
      } finally {
        rejoinSyncRef.current = false;
      }
    }

    void ensureMembershipAfterRefresh();
    return () => {
      isMounted = false;
    };
  }, [loadingRoom, orderedPlayers, refreshRoomSnapshot, room?.id, user]);

  useEffect(() => {
    if (!room?.id || !user?.id) return undefined;

    let cancelled = false;
    const sendHeartbeat = async () => {
      const response = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}&user_id=eq.${user.id}`,
        {
          method: 'PATCH',
          body: { last_seen_at: new Date().toISOString() },
        },
        'heartbeat_last_seen'
      );
      if (!response.ok && !cancelled) {
        devLog('[STUDY-NIGHT] heartbeat failed', response);
      }
    };

    void sendHeartbeat();
    const intervalId = setInterval(() => {
      void sendHeartbeat();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [room?.id, user?.id]);

  useEffect(() => {
    if (!room?.id || !user?.id) return;
    const isFinished = room.status === 'finished' || state?.phase === 'finished';
    if (!isFinished) return;

    const eventKey = `${room.id}:${user.id}`;
    if (finishedEventKeyRef.current === eventKey) return;
    finishedEventKeyRef.current = eventKey;

    const createdAtMs = new Date(room.created_at || 0).getTime();
    const durationSec =
      Number.isFinite(createdAtMs) && createdAtMs > 0
        ? Math.max(0, Math.round((Date.now() - createdAtMs) / 1000))
        : 0;

    void trackEvent('study_night_finished', { durationSec });
  }, [room?.created_at, room?.id, room?.status, state?.phase, user?.id]);

  useEffect(() => {
    if (!room?.id || state?.phase !== 'reveal') return;
    if (!state?.question_id || !question || !currentTurnPlayer) return;

    const turnKey = getTurnKey(room.id, state);
    if (!turnKey || gradedTurnKeysRef.current[turnKey]) return;

    const baselineScores = scoreBaselineRef.current[state.question_id] || null;
    const turnPlayerBaseline =
      baselineScores && typeof baselineScores[currentTurnPlayer.user_id] === 'number'
        ? baselineScores[currentTurnPlayer.user_id]
        : null;

    let wasCorrect = false;
    if (typeof turnPlayerBaseline === 'number') {
      wasCorrect = (currentTurnPlayer.score || 0) >= turnPlayerBaseline + 100;
    } else if (currentTurnPlayer.user_id === user?.id) {
      wasCorrect = Boolean(correctByQuestion[state.question_id]);
    }

    void recordTurnStats(currentTurnPlayer.user_id, wasCorrect, question.blueprint_code);
    gradedTurnKeysRef.current[turnKey] = true;
  }, [
    correctByQuestion,
    currentTurnPlayer,
    question,
    recordTurnStats,
    room?.id,
    state,
    user?.id,
  ]);

  useEffect(() => {
    if (state?.phase !== 'question' || !state?.started_at) {
      setSecondsLeft(0);
      return undefined;
    }

    const tick = () => {
      const startedAtMs = new Date(state.started_at).getTime();
      const durationMs = getRoomDurationSec(room) * 1000;
      const deadlineMs = startedAtMs + durationMs;
      const remainingMs = Math.max(0, deadlineMs - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setSecondsLeft(remainingSec);

      if (remainingSec > 0 || !isHost || !room?.id || state.phase !== 'question') return;

      const revealKey = `${room.id}:${state.round_no}:${state.question_id}`;
      if (revealKeyRef.current === revealKey) return;
      revealKeyRef.current = revealKey;
      void movePhaseToReveal();
    };

    tick();
    const intervalId = setInterval(tick, 300);
    return () => clearInterval(intervalId);
  }, [
    isHost,
    movePhaseToReveal,
    room?.id,
    room?.duration_sec,
    state?.phase,
    state?.question_id,
    state?.round_no,
    state?.started_at,
  ]);

  async function handleStartGame() {
    if (!room) return;
    if (!isHost) {
      setMessage('Only the host can start the game.');
      return;
    }
    try {
      const { deck, deckPos, deckCounts } = await buildRoomDeck();
      setDeckCountsByKey(deckCounts);

      const roomUpdateResponse = await timedPostgrest(
        `study_rooms?id=eq.${room.id}`,
        {
          method: 'PATCH',
          body: { status: 'running' },
        },
        'start_update_room'
      );
      if (!roomUpdateResponse.ok) {
        throw toPostgrestError(roomUpdateResponse, 'Failed to start room.');
      }

      const stateUpsertResponse = await timedPostgrest(
        'study_room_state?on_conflict=room_id',
        {
          method: 'POST',
          body: {
            room_id: room.id,
            ...DEFAULT_STATE,
            duration_sec: getRoomDurationSec(room),
            deck,
            deck_pos: deckPos,
          },
          headers: { prefer: 'resolution=merge-duplicates,return=representation' },
        },
        'start_upsert_state'
      );
      if (!stateUpsertResponse.ok) {
        throw toPostgrestError(stateUpsertResponse, 'Failed to initialize room state.');
      }

      await refreshRoomSnapshot(room.id);
      setMessage('');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to start game.';
      setMessage(nextMessage);
    }
  }

  async function handlePickCategory(categoryKey) {
    if (!canPickCategory || !room || !user?.id) return;
    setDeckHealthCategoryKey(categoryKey);
    const nextGameType = isRouletteMode ? null : normalizeGameType(selectedGameType);

    if (isHost) {
      await pickCategoryAsHost(categoryKey, nextGameType);
      return;
    }

    const channel = channelRef.current;
    if (!channel) {
      setMessage('Realtime channel not ready.');
      return;
    }

    await channel.send({
      type: 'broadcast',
      event: 'category-pick',
      payload: {
        roomId: room.id,
        userId: user.id,
        categoryKey,
        gameType: nextGameType || undefined,
      },
    });
    setMessage('Category pick sent to host.');
  }

  async function handleSubmitAnswer(submittedValue) {
    if (!room || !state || !question || !user?.id) return;
    if (state.phase !== 'question') return;
    const turnKey = getTurnKey(room.id, state);
    if (!isMyTurn) {
      setMessage(`Waiting for ${currentTurnPlayer ? getDisplayName(currentTurnPlayer) : 'current player'}.`);
      return;
    }
    if (turnKey && submittedTurnKeysRef.current[turnKey]) {
      setMessage('Already answered.');
      return;
    }
    if (submittedByQuestion[question.id]) return;

    const activeQuestionType = normalizeGameType(question.question_type || state.game_type || 'mcq');
    const submittedFillValue = normalizeAnswerText(submittedValue);
    const correctAnswerText = getCorrectAnswerText(question);
    const normalizedCorrectAnswer = normalizeAnswerText(correctAnswerText);
    const isCorrect =
      activeQuestionType === 'fill'
        ? Boolean(submittedFillValue) && submittedFillValue === normalizedCorrectAnswer
        : submittedValue === question.correct_index;

    if (activeQuestionType === 'fill') {
      setFillInputByQuestion((prev) => ({ ...prev, [question.id]: String(submittedValue || '') }));
    } else {
      setSelectedAnswer((prev) => ({ ...prev, [question.id]: submittedValue }));
    }
    setSubmittedByQuestion((prev) => ({ ...prev, [question.id]: true }));
    setCorrectByQuestion((prev) => ({ ...prev, [question.id]: isCorrect }));

    try {
      const actorUserId = user.id;
      if (!actorUserId) {
        throw new Error('Missing authenticated user.');
      }
      const scoreReadResponse = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}&user_id=eq.${actorUserId}&select=score&limit=1`,
        undefined,
        'submit_read_score'
      );
      if (!scoreReadResponse.ok) {
        throw toPostgrestError(scoreReadResponse, 'Failed to read player score.');
      }
      const currentRow = firstRow(scoreReadResponse.data);

      const nextScore = (currentRow?.score || 0) + (isCorrect ? 100 : 0);
      const scoreUpdateResponse = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}&user_id=eq.${actorUserId}`,
        {
          method: 'PATCH',
          body: {
            score: nextScore,
            last_seen_at: new Date().toISOString(),
          },
        },
        'submit_update_score'
      );
      if (!scoreUpdateResponse.ok) {
        throw toPostgrestError(scoreUpdateResponse, 'Failed to update score.');
      }
      if (turnKey) {
        submittedTurnKeysRef.current[turnKey] = true;
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to submit answer.';
      setMessage(nextMessage);
      setSubmittedByQuestion((prev) => ({ ...prev, [question.id]: false }));
    }
  }

  function handleFillSubmit(event) {
    event.preventDefault();
    if (!question?.id) return;
    const fillValue = fillInputByQuestion[question.id] || '';
    if (!normalizeAnswerText(fillValue)) return;
    void handleSubmitAnswer(fillValue);
  }

  async function handleAdvanceTurn() {
    if (!room || !state || state.phase !== 'reveal' || playerCount === 0) return;
    if (!isHost) {
      setMessage('Only the host can advance turns.');
      return;
    }
    if (!currentTurnPlayer) return;

    try {
      const roomWinWedges = getRoomWinWedges(room);
      const questionId = state.question_id;
      const categoryKey = state.category_key;
      const baselineScores = questionId ? scoreBaselineRef.current[questionId] : null;
      const turnPlayerBaseline =
        baselineScores && typeof baselineScores[currentTurnPlayer.user_id] === 'number'
          ? baselineScores[currentTurnPlayer.user_id]
          : null;

      let currentTurnCorrect = false;
      if (typeof turnPlayerBaseline === 'number') {
        currentTurnCorrect = (currentTurnPlayer.score || 0) >= turnPlayerBaseline + 100;
      } else if (currentTurnPlayer.user_id === user?.id && questionId) {
        currentTurnCorrect = Boolean(correctByQuestion[questionId]);
      }

      let nextWedges = getWedges(currentTurnPlayer);
      if (currentTurnCorrect && categoryKey && !nextWedges.includes(categoryKey)) {
        const wedgeTargetUserId = currentTurnPlayer.user_id;
        if (!orderedPlayers.some((player) => player.user_id === wedgeTargetUserId)) {
          throw new Error('Invalid mark update target.');
        }
        nextWedges = [...nextWedges, categoryKey];
        const wedgeResponse = await timedPostgrest(
          `study_room_players?room_id=eq.${room.id}&user_id=eq.${wedgeTargetUserId}`,
          {
            method: 'PATCH',
            body: {
              wedges: nextWedges,
              last_seen_at: new Date().toISOString(),
            },
          },
          'advance_update_wedge'
        );
        if (!wedgeResponse.ok) {
          throw toPostgrestError(wedgeResponse, 'Failed to award mark.');
        }
      }

      const playersAfterReveal = orderedPlayers.map((player) => {
        if (player.user_id !== currentTurnPlayer.user_id) return player;
        return {
          ...player,
          wedges: nextWedges,
        };
      });
      const winnerAfterReveal =
        playersAfterReveal.find((player) => getWedges(player).length >= roomWinWedges) || null;

      if (winnerAfterReveal) {
        const roomFinishResponse = await timedPostgrest(
          `study_rooms?id=eq.${room.id}`,
          {
            method: 'PATCH',
            body: { status: 'finished' },
          },
          'advance_finish_room'
        );
        if (!roomFinishResponse.ok) {
          throw toPostgrestError(roomFinishResponse, 'Failed to finish room.');
        }

        const stateFinishResponse = await patchStudyRoomStateWithRetry(
          `study_room_state?room_id=eq.${room.id}`,
          {
            phase: 'finished',
            started_at: null,
          },
          'advance_finish_state',
          { onMutation: setLastMutation }
        );
        if (!stateFinishResponse.ok) {
          throw toPostgrestError(stateFinishResponse, 'Failed to finish state.');
        }

        await refreshRoomSnapshot(room.id);
        return;
      }

      const nextTurnIndex = playerCount > 0 ? (turnIndex + 1) % playerCount : 0;
      const stateAdvanceResponse = await patchStudyRoomStateWithRetry(
        `study_room_state?room_id=eq.${room.id}`,
        {
          turn_index: nextTurnIndex,
          phase: 'pick',
          category_key: null,
          question_id: null,
          started_at: null,
          round_no: (state.round_no || 1) + 1,
        },
        'advance_next_turn',
        { onMutation: setLastMutation }
      );
      if (!stateAdvanceResponse.ok) {
        throw toPostgrestError(stateAdvanceResponse, 'Failed to advance turn.');
      }

      await refreshRoomSnapshot(room.id);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to advance turn.';
      setMessage(nextMessage);
    }
  }

  async function handleForceResync() {
    if (!room) return;
    if (!isHost) {
      setMessage('Only the host can force resync.');
      return;
    }

    try {
      await refreshRoomSnapshot(room.id);
      setMessage('');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to resync room.';
      setMessage(nextMessage);
    }
  }

  async function handleEndGame() {
    if (!room) return;
    if (!isHost) {
      setMessage('Only the host can end the game.');
      return;
    }

    try {
      const roomFinishResponse = await timedPostgrest(
        `study_rooms?id=eq.${room.id}`,
        {
          method: 'PATCH',
          body: { status: 'finished' },
        },
        'host_tools_end_room'
      );
      if (!roomFinishResponse.ok) {
        throw toPostgrestError(roomFinishResponse, 'Failed to end room.');
      }

      const stateFinishResponse = await patchStudyRoomStateWithRetry(
        `study_room_state?room_id=eq.${room.id}`,
        {
          phase: 'finished',
          started_at: null,
        },
        'host_tools_end_state',
        { onMutation: setLastMutation }
      );
      if (!stateFinishResponse.ok) {
        throw toPostgrestError(stateFinishResponse, 'Failed to end room state.');
      }

      await refreshRoomSnapshot(room.id);
      setMessage('');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to end game.';
      setMessage(nextMessage);
    }
  }

  async function handleResetRoom() {
    if (!room) return;
    if (!isHost) {
      setMessage('Only the host can reset the room.');
      return;
    }
    if (!confirmResetRoom) {
      setMessage('Confirm reset before continuing.');
      return;
    }

    try {
      const roomResetResponse = await timedPostgrest(
        `study_rooms?id=eq.${room.id}`,
        {
          method: 'PATCH',
          body: { status: 'lobby' },
        },
        'host_tools_reset_room'
      );
      if (!roomResetResponse.ok) {
        throw toPostgrestError(roomResetResponse, 'Failed to reset room.');
      }

      const stateResetResponse = await patchStudyRoomStateWithRetry(
        `study_room_state?room_id=eq.${room.id}`,
        {
          phase: 'pick',
          game_type: 'mcq',
          turn_index: 0,
          category_key: null,
          question_id: null,
          started_at: null,
          round_no: 1,
          deck_pos: {},
          duration_sec: getRoomDurationSec(room),
        },
        'host_tools_reset_state',
        { onMutation: setLastMutation }
      );
      if (!stateResetResponse.ok) {
        throw toPostgrestError(stateResetResponse, 'Failed to reset room state.');
      }

      const playersResetResponse = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}`,
        {
          method: 'PATCH',
          body: {
            score: 0,
            wedges: [],
            coach_stats: {},
            last_seen_at: new Date().toISOString(),
          },
        },
        'host_tools_reset_players'
      );
      if (!playersResetResponse.ok) {
        throw toPostgrestError(playersResetResponse, 'Failed to reset player progress.');
      }

      scoreBaselineRef.current = {};
      submittedTurnKeysRef.current = {};
      gradedTurnKeysRef.current = {};
      coachStatsRef.current = {};
      setCoachStatsVersion((value) => value + 1);
      setSelectedAnswer({});
      setFillInputByQuestion({});
      setSubmittedByQuestion({});
      setCorrectByQuestion({});
      setConfirmResetRoom(false);

      await refreshRoomSnapshot(room.id);
      setMessage('');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to reset room.';
      setMessage(nextMessage);
    }
  }

  if (authLoading || loadingRoom) {
    return (
      <section>
        <h1>Study Night Room</h1>
        <p className="muted">Loading room...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section>
        <h1>Study Night Room</h1>
        <p className="muted">Redirecting to sign in...</p>
      </section>
    );
  }

  if (!room) {
    return (
      <section>
        <h1>Study Night Room</h1>
        {loadErrorInfo ? (
          <div className="status error">
            <p>{loadErrorInfo.message}</p>
            {loadErrorInfo.details ? <p>Details: {loadErrorInfo.details}</p> : null}
            {loadErrorInfo.hint ? <p>Hint: {loadErrorInfo.hint}</p> : null}
            {loadErrorInfo.code ? <p>Code: {loadErrorInfo.code}</p> : null}
            {loadErrorInfo.status ? <p>Status: {loadErrorInfo.status}</p> : null}
          </div>
        ) : (
          <p className="status error">Room not found.</p>
        )}
      </section>
    );
  }

  const currentCategory = state?.category_key ? studyNightCategoryByKey[state.category_key] : null;
  const roomWinWedges = getRoomWinWedges(room);
  const roomDurationSec = getRoomDurationSec(room);
  const winner = orderedPlayers.find((player) => getWedges(player).length >= roomWinWedges) || null;
  const selectedAnswerIndex = question?.id ? selectedAnswer[question.id] : null;
  const fillInputValue = question?.id ? fillInputByQuestion[question.id] || '' : '';
  const explanationBlocks = question ? getExplanationBlocks(question.explanation) : [];
  const currentGameType = normalizeGameType(state?.game_type || question?.question_type || 'mcq');
  const currentGameTypeLabel = getGameTypeLabel(currentGameType);
  const pickPhaseGameTypeLabel = isRouletteMode
    ? 'MCQ / Reverse / Fill (host roulette)'
    : getGameTypeLabel(selectedGameType);
  const isFillQuestion = currentGameType === 'fill';
  const correctAnswerText = question ? getCorrectAnswerText(question) : '';
  const currentTurnWedges = getWedges(currentTurnPlayer);
  const activeTurnKey = getTurnKey(room?.id, state);
  const alreadyAnsweredTurn = Boolean(activeTurnKey && submittedTurnKeysRef.current[activeTurnKey]);
  const deckHealthCategory =
    studyNightCategoryByKey[deckHealthCategoryKey] || studyNightCategories[0] || null;
  const deckHealthMcqCount = getDeckBucketCount(deckCountsByKey, deckHealthCategory?.key, 'mcq');
  const deckHealthReverseCount = getDeckBucketCount(deckCountsByKey, deckHealthCategory?.key, 'reverse');
  const deckHealthFillCount = getDeckBucketCount(deckCountsByKey, deckHealthCategory?.key, 'fill');
  const coachStatsByUser = useMemo(() => coachStatsRef.current, [coachStatsVersion]);
  const myCoachStats = myPlayer ? getPlayerCoachStats(myPlayer, coachStatsByUser) : createEmptyCoachStats();
  const myTopMiss = getTopMissEntry(myCoachStats.missesByPrefix);
  const myTopMissPrefix = myTopMiss?.prefix || '';
  const nextPickSuggestions = getNextPickSuggestions(myCoachStats.missesByPrefix, myWedges);
  const mySuggestedCategoryPrefix = nextPickSuggestions[0]?.key || '';
  const drillPrefix = myTopMissPrefix || mySuggestedCategoryPrefix || '';
  const drillTypeParam = (() => {
    if (isRouletteMode) return '';
    const lastType = normalizeGameType(state?.game_type || question?.question_type || 'mcq');
    return lastType === 'reverse' ? 'reverse' : 'mcq';
  })();
  const drillHref = useMemo(() => {
    if (!drillPrefix) return '';
    const params = new URLSearchParams();
    params.set('code', drillPrefix);
    if (drillTypeParam) {
      params.set('type', drillTypeParam);
    }
    return `/drill?${params.toString()}`;
  }, [drillPrefix, drillTypeParam]);

  return (
    <section>
      <h1>Study Night Room {room.code}</h1>
      <p className="muted">
        Status: {room.status} | Round: {state?.round_no || 1} | Phase: {state?.phase || 'pick'} |
        Win marks: {roomWinWedges} | Timer: {roomDurationSec}s
      </p>

      <div className="game-grid">
        <div className="game-card">
          <h2>Players</h2>
          <p className="muted">Active {activePlayersCount} / Total {orderedPlayers.length}</p>
          <ul className="game-list">
            {orderedPlayers.map((player, index) => {
              const wedges = getWedges(player);
              const isTurn = currentTurnPlayer?.user_id === player.user_id;
              return (
                <li key={player.id}>
                  <strong>{getDisplayName(player)}</strong>
                  {isTurn ? ' (turn)' : ''}
                  {player.user_id === room.host_user_id ? ' (host)' : ''}
                  <div className="muted">Score: {player.score || 0}</div>
                  <div className="muted">Earned {wedges.length} / {roomWinWedges}</div>
                  <div className="mark-chip-row">
                    {wedges.length > 0 ? (
                      wedges.map((key) => (
                        <span key={`${player.id}-${key}`} className="mark-chip">
                          <span aria-hidden="true">✓</span> {getCategoryLabelByKey(key)}
                        </span>
                      ))
                    ) : (
                      <span className="muted">No marks yet.</span>
                    )}
                  </div>
                  <div className="muted">Seat: {index + 1}</div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="game-card">
          {room.status === 'lobby' ? (
            <>
              <h2>Lobby</h2>
              <p className="muted">Share code {room.code} with friends.</p>
              {isHost ? (
                <button type="button" onClick={handleStartGame} disabled={orderedPlayers.length < 1}>
                  Start
                </button>
              ) : (
                <p className="muted">Waiting for host to start.</p>
              )}
            </>
          ) : null}

          {room.status === 'running' && state?.phase === 'pick' ? (
            <>
              <h2>Pick Category</h2>
              <p className="muted">
                Current turn: {currentTurnPlayer ? getDisplayName(currentTurnPlayer) : 'Unknown'}
              </p>
              <p className="muted">This turn: {pickPhaseGameTypeLabel}</p>
              {!isRouletteMode ? (
                <>
                  <label htmlFor="study-night-game-type">Game type</label>
                  <select
                    id="study-night-game-type"
                    value={selectedGameType}
                    onChange={(event) => setSelectedGameType(normalizeGameType(event.target.value))}
                    disabled={!canPickCategory}
                  >
                    <option value="mcq">MCQ</option>
                    <option value="reverse">Reverse</option>
                    <option value="fill">Fill</option>
                  </select>
                </>
              ) : null}
              <div className="category-tile-grid">
                {studyNightCategories.map((category) => (
                  (() => {
                    const isOwnedByCurrentTurnPlayer = currentTurnWedges.includes(category.key);
                    return (
                      <button
                        key={category.key}
                        type="button"
                        className={`category-tile${isOwnedByCurrentTurnPlayer ? ' earned' : ''}`}
                        onClick={() => void handlePickCategory(category.key)}
                        disabled={!canPickCategory || isOwnedByCurrentTurnPlayer}
                        aria-label={`${category.key}: ${category.label}${
                          isOwnedByCurrentTurnPlayer ? ' (owned)' : ''
                        }`}
                      >
                        <strong>{category.label}</strong>
                        <span className="muted">Category {category.key}</span>
                        {isOwnedByCurrentTurnPlayer ? <span className="category-earned">Earned</span> : null}
                      </button>
                    );
                  })()
                ))}
              </div>
              {!canPickCategory ? (
                <p className="muted">Only the current player can pick (host can override).</p>
              ) : currentTurnWedges.length > 0 ? (
                <p className="muted">Owned categories are disabled for this turn player.</p>
              ) : null}
            </>
          ) : null}

          {room.status === 'running' && state?.phase === 'question' ? (
            <>
              <h2>Quickfire {currentGameTypeLabel}</h2>
              <p className="muted">This turn: {currentGameTypeLabel}</p>
              <p className="muted">
                Category: {currentCategory ? `${currentCategory.key} (${currentCategory.prefix})` : 'n/a'}
              </p>
              <p className="muted">Time left: {secondsLeft}s</p>
              {!isMyTurn ? (
                <p className="muted">
                  Waiting for {currentTurnPlayer ? getDisplayName(currentTurnPlayer) : 'current player'}.
                </p>
              ) : null}
              {alreadyAnsweredTurn ? <p className="muted">Already answered.</p> : null}
              {question ? (
                <>
                  <p className="runner-prompt">{question.prompt}</p>
                  {isFillQuestion ? (
                    <form className="auth-form" onSubmit={handleFillSubmit}>
                      <label htmlFor="study-night-fill-answer">Your answer</label>
                      <input
                        id="study-night-fill-answer"
                        type="text"
                        autoFocus
                        value={fillInputValue}
                        onChange={(event) =>
                          setFillInputByQuestion((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        disabled={!isMyTurn || alreadyAnsweredTurn || Boolean(submittedByQuestion[question.id])}
                      />
                      <button
                        type="submit"
                        disabled={
                          !isMyTurn ||
                          alreadyAnsweredTurn ||
                          Boolean(submittedByQuestion[question.id]) ||
                          !normalizeAnswerText(fillInputValue)
                        }
                      >
                        Submit
                      </button>
                    </form>
                  ) : (
                    <div className="choice-list">
                      {(question.choices || []).map((choice, index) => {
                        const isSelected = selectedAnswerIndex === index;
                        return (
                          <button
                            key={`${question.id}-${index}`}
                            type="button"
                            className={`choice-btn${isSelected ? ' selected' : ''}`}
                            disabled={!isMyTurn || alreadyAnsweredTurn || Boolean(submittedByQuestion[question.id])}
                            onClick={() => void handleSubmitAnswer(index)}
                          >
                            {String(choice)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Loading question...</p>
              )}
            </>
          ) : null}

          {room.status === 'running' && state?.phase === 'reveal' ? (
            <>
              <h2>Reveal</h2>
              {question ? (
                <>
                  <p className="muted">Game type: {currentGameTypeLabel}</p>
                  {isFillQuestion ? (
                    <p>
                      <strong>Correct fill answer: {correctAnswerText || 'Unknown'}</strong>
                    </p>
                  ) : (
                    <p className="muted">Correct answer: {correctAnswerText || 'Unknown'}</p>
                  )}
                  {explanationBlocks.map((block) => (
                    <div key={block.label} className="explanation-box">
                      <strong>{block.label}:</strong> {block.text}
                    </div>
                  ))}
                </>
              ) : null}
              {isHost ? (
                <button type="button" onClick={handleAdvanceTurn}>
                  Next turn
                </button>
              ) : (
                <p className="muted">Waiting for host to advance.</p>
              )}
            </>
          ) : null}

          {(room.status === 'finished' || state?.phase === 'finished') ? (
            <>
              <h2>Finished</h2>
              <p className="muted">
                Winner: {winner ? getDisplayName(winner) : 'No winner recorded'}
              </p>
              <ul className="game-list">
                {orderedPlayers.map((player) => (
                  <li key={`final-${player.id}`}>
                    <strong>{getDisplayName(player)}</strong>
                    <div className="muted">Final score: {player.score || 0}</div>
                    <div className="muted">
                      Earned: {getWedges(player).length}/{roomWinWedges}
                    </div>
                  </li>
                ))}
              </ul>
              <h3>Coach Review</h3>
              <ul className="game-list">
                {orderedPlayers.map((player) => {
                  const stats = getPlayerCoachStats(player, coachStatsByUser);
                  const topMiss = getTopMissEntry(stats.missesByPrefix);
                  return (
                    <li key={`coach-${player.id}`}>
                      <strong>{getDisplayName(player)}</strong>
                      <div className="muted">
                        Correct: {stats.correct}/{stats.totalAnswered}
                      </div>
                      <div className="muted">
                        {topMiss
                          ? `Top miss: ${topMiss.prefix} (${topMiss.count})`
                          : 'No misses recorded.'}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {myPlayer ? (
                <>
                  <p className="muted">
                    Next picks:{' '}
                    {nextPickSuggestions.length > 0
                      ? nextPickSuggestions.map((category) => `${category.key}`).join(', ')
                      : 'No suggestions.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!drillHref) return;
                      router.push(drillHref);
                    }}
                    disabled={!drillHref}
                  >
                    Drill my weak spots
                  </button>
                  {!drillHref ? (
                    <p className="muted">No drill target yet; play again or answer more questions.</p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {isHost ? (
            <>
              <h2>Host Tools</h2>
              <h3>Deck Health</h3>
              <label htmlFor="study-night-deck-health-category">Category</label>
              <select
                id="study-night-deck-health-category"
                value={deckHealthCategory?.key || ''}
                onChange={(event) => setDeckHealthCategoryKey(event.target.value)}
              >
                {studyNightCategories.map((category) => (
                  <option key={`deck-health-${category.key}`} value={category.key}>
                    {category.key}. {category.label}
                  </option>
                ))}
              </select>
              <p className="muted">
                {deckHealthCategory ? `${deckHealthCategory.key}. ${deckHealthCategory.label}` : 'Category n/a'} |
                MCQ: {deckHealthMcqCount} | Reverse: {deckHealthReverseCount} | Fill: {deckHealthFillCount}
              </p>
              <div className="choice-list">
                <button type="button" onClick={handleForceResync}>
                  Force Resync
                </button>
                <button type="button" onClick={handleEndGame}>
                  End Game
                </button>
                <button type="button" onClick={() => setShowDiagnostics((value) => !value)}>
                  {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
                </button>
              </div>
              {showDiagnostics ? (
                <div className="runner">
                  <h3>Diagnostics</h3>
                  <p className="muted">Realtime: {realtimeStatus || 'unknown'}</p>
                  <p className="muted">
                    Last snapshot:{' '}
                    {lastSnapshotAt ? new Date(lastSnapshotAt).toLocaleString() : 'n/a'}
                  </p>
                  <p className="muted">
                    Last mutation:{' '}
                    {lastMutation?.name
                      ? `${lastMutation.name} | ${lastMutation.ok === null ? 'running' : lastMutation.ok ? 'ok' : 'failed'}`
                      : 'n/a'}
                  </p>
                  {lastMutation?.at ? (
                    <p className="muted">Mutation time: {new Date(lastMutation.at).toLocaleString()}</p>
                  ) : null}
                  {lastMutation?.status !== undefined && lastMutation?.status !== '' ? (
                    <p className="muted">Mutation status: {String(lastMutation.status)}</p>
                  ) : null}
                  {lastMutation?.message ? (
                    <p className="muted">Mutation message: {lastMutation.message}</p>
                  ) : null}
                </div>
              ) : null}
              <label htmlFor="study-night-confirm-reset" className="muted">
                <input
                  id="study-night-confirm-reset"
                  type="checkbox"
                  checked={confirmResetRoom}
                  onChange={(event) => setConfirmResetRoom(event.target.checked)}
                />{' '}
                Are you sure?
              </label>
              <div>
                <button type="button" onClick={handleResetRoom} disabled={!confirmResetRoom}>
                  Reset Room
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <p className="muted">Your marks: Earned {myWedges.length} / {roomWinWedges}</p>
      {loadErrorInfo ? (
        <div className="status error">
          <p>{loadErrorInfo.message}</p>
          {loadErrorInfo.details ? <p>Details: {loadErrorInfo.details}</p> : null}
          {loadErrorInfo.hint ? <p>Hint: {loadErrorInfo.hint}</p> : null}
          {loadErrorInfo.code ? <p>Code: {loadErrorInfo.code}</p> : null}
          {loadErrorInfo.status ? <p>Status: {loadErrorInfo.status}</p> : null}
        </div>
      ) : null}
      {message ? <p className="status error">{message}</p> : null}
    </section>
  );
}
