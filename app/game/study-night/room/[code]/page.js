'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseClient } from '../../../../../src/lib/supabaseClient';
import { postgrestFetch } from '../../../../../src/lib/postgrestFetch';
import { devLog } from '../../../../../src/lib/devLog';
import { useAuth } from '../../../../../src/providers/AuthProvider';
import {
  studyNightCategories,
  studyNightCategoryByKey,
} from '../../../../../src/game/studyNightCategories';

const DEFAULT_STATE = {
  phase: 'pick',
  game_type: 'mcq',
  turn_index: 0,
  category_key: null,
  question_id: null,
  started_at: null,
  duration_sec: 12,
  round_no: 1,
};

function normalizeGameType(value) {
  return value === 'reverse' ? 'reverse' : 'mcq';
}

function getGameTypeLabel(value) {
  return normalizeGameType(value) === 'reverse' ? 'Reverse' : 'MCQ';
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
  const [submittedByQuestion, setSubmittedByQuestion] = useState({});
  const [correctByQuestion, setCorrectByQuestion] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selectedGameType, setSelectedGameType] = useState('mcq');

  const channelRef = useRef(null);
  const revealKeyRef = useRef('');
  const scoreBaselineRef = useRef({});

  const orderedPlayers = useMemo(() => sortPlayers(players), [players]);
  const playerCount = orderedPlayers.length;
  const turnIndex = state?.turn_index || 0;
  const currentTurnPlayer = playerCount > 0 ? orderedPlayers[turnIndex % playerCount] : null;
  const myPlayer = orderedPlayers.find((player) => player.user_id === user?.id) || null;
  const myWedges = getWedges(myPlayer);
  const isHost = Boolean(user?.id && room?.host_user_id === user.id);
  const isCurrentTurn = Boolean(user?.id && currentTurnPlayer?.user_id === user.id);
  const canPickCategory =
    room?.status === 'running' && state?.phase === 'pick' && Boolean(currentTurnPlayer) && (isCurrentTurn || isHost);

  const refreshRoomSnapshot = useCallback(
    async (roomId) => {
      if (!roomId) return;

      const [roomResult, playerResult, stateResult] = await Promise.all([
        timedPostgrest(
          `study_rooms?id=eq.${roomId}&select=id,code,host_user_id,status,created_at&limit=1`,
          undefined,
          'snapshot_room'
        ),
        timedPostgrest(
          `study_room_players?room_id=eq.${roomId}&select=id,room_id,user_id,display_name,score,wedges,joined_at,last_seen_at&order=joined_at.asc`,
          undefined,
          'snapshot_players'
        ),
        timedPostgrest(
          `study_room_state?room_id=eq.${roomId}&select=room_id,turn_index,phase,game_type,category_key,question_id,started_at,duration_sec,round_no,updated_at&limit=1`,
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
    },
    [setPlayers, setQuestion, setRoom, setState]
  );

  const pickCategoryAsHost = useCallback(
    async (categoryKey, gameType = 'mcq') => {
      if (!isHost || !room || room.status !== 'running' || state?.phase !== 'pick') return;

      const category = studyNightCategoryByKey[categoryKey];
      const normalizedGameType = normalizeGameType(gameType);
      if (!category) {
        setMessage('Invalid category.');
        return;
      }

      try {
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
        let nextQuestion = firstRow(questionResult.data);
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

        if (!nextQuestion) {
          setMessage(`No ${getGameTypeLabel(normalizedGameType)} question found for category ${category.key}.`);
          return;
        }

        scoreBaselineRef.current[nextQuestion.id] = Object.fromEntries(
          orderedPlayers.map((player) => [player.user_id, player.score || 0])
        );

        const stateUpdateResult = await timedPostgrest(
          `study_room_state?room_id=eq.${room.id}`,
          {
            method: 'PATCH',
            body: {
              phase: 'question',
              game_type: normalizedGameType,
              category_key: category.key,
              question_id: nextQuestion.id,
              started_at: new Date().toISOString(),
            },
          },
          'pick_update_state'
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
    [isHost, orderedPlayers, refreshRoomSnapshot, room, state?.phase, state?.round_no]
  );

  const movePhaseToReveal = useCallback(async () => {
    if (!isHost || !room || state?.phase !== 'question') return;

    const response = await timedPostgrest(
      `study_room_state?room_id=eq.${room.id}`,
      {
        method: 'PATCH',
        body: {
          phase: 'reveal',
          started_at: null,
        },
      },
      'question_to_reveal'
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
          )}&select=id,code,host_user_id,status,created_at&limit=1`,
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
      .subscribe();

    return () => {
      channelRef.current = null;
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
    if (state?.phase !== 'question' || !state?.started_at) {
      setSecondsLeft(0);
      return undefined;
    }

    const tick = () => {
      const startedAtMs = new Date(state.started_at).getTime();
      const durationMs = (state.duration_sec || 12) * 1000;
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
    state?.duration_sec,
    state?.phase,
    state?.question_id,
    state?.round_no,
    state?.started_at,
  ]);

  async function handleStartGame() {
    if (!isHost || !room) return;
    try {
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
    const nextGameType = normalizeGameType(selectedGameType);

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
        gameType: nextGameType,
      },
    });
    setMessage('Category pick sent to host.');
  }

  async function handleSubmitAnswer(choiceIndex) {
    if (!room || !state || !question || !user?.id) return;
    if (state.phase !== 'question') return;
    if (submittedByQuestion[question.id]) return;

    const isCorrect = choiceIndex === question.correct_index;
    setSelectedAnswer((prev) => ({ ...prev, [question.id]: choiceIndex }));
    setSubmittedByQuestion((prev) => ({ ...prev, [question.id]: true }));
    setCorrectByQuestion((prev) => ({ ...prev, [question.id]: isCorrect }));

    try {
      const scoreReadResponse = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}&user_id=eq.${user.id}&select=score&limit=1`,
        undefined,
        'submit_read_score'
      );
      if (!scoreReadResponse.ok) {
        throw toPostgrestError(scoreReadResponse, 'Failed to read player score.');
      }
      const currentRow = firstRow(scoreReadResponse.data);

      const nextScore = (currentRow?.score || 0) + (isCorrect ? 100 : 0);
      const scoreUpdateResponse = await timedPostgrest(
        `study_room_players?room_id=eq.${room.id}&user_id=eq.${user.id}`,
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
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to submit answer.';
      setMessage(nextMessage);
      setSubmittedByQuestion((prev) => ({ ...prev, [question.id]: false }));
    }
  }

  async function handleAdvanceTurn() {
    if (!isHost || !room || !state || state.phase !== 'reveal' || playerCount === 0) return;
    if (!currentTurnPlayer) return;

    try {
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
        nextWedges = [...nextWedges, categoryKey];
        const wedgeResponse = await timedPostgrest(
          `study_room_players?room_id=eq.${room.id}&user_id=eq.${currentTurnPlayer.user_id}`,
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
          throw toPostgrestError(wedgeResponse, 'Failed to award wedge.');
        }
      }

      if (nextWedges.length >= 3) {
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

        const stateFinishResponse = await timedPostgrest(
          `study_room_state?room_id=eq.${room.id}`,
          {
            method: 'PATCH',
            body: {
              phase: 'finished',
              started_at: null,
            },
          },
          'advance_finish_state'
        );
        if (!stateFinishResponse.ok) {
          throw toPostgrestError(stateFinishResponse, 'Failed to finish state.');
        }

        await refreshRoomSnapshot(room.id);
        return;
      }

      const nextTurnIndex = playerCount > 0 ? (turnIndex + 1) % playerCount : 0;
      const stateAdvanceResponse = await timedPostgrest(
        `study_room_state?room_id=eq.${room.id}`,
        {
          method: 'PATCH',
          body: {
            turn_index: nextTurnIndex,
            phase: 'pick',
            category_key: null,
            question_id: null,
            started_at: null,
            round_no: (state.round_no || 1) + 1,
          },
        },
        'advance_next_turn'
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
  const winner = orderedPlayers.find((player) => getWedges(player).length >= 3) || null;
  const selectedAnswerIndex = question?.id ? selectedAnswer[question.id] : null;
  const explanationBlocks = question ? getExplanationBlocks(question.explanation) : [];
  const currentGameType = normalizeGameType(state?.game_type || question?.question_type || 'mcq');
  const currentGameTypeLabel = getGameTypeLabel(currentGameType);

  return (
    <section>
      <h1>Study Night Room {room.code}</h1>
      <p className="muted">
        Status: {room.status} | Round: {state?.round_no || 1} | Phase: {state?.phase || 'pick'}
      </p>

      <div className="game-grid">
        <div className="game-card">
          <h2>Players</h2>
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
                  <div className="muted">
                    Wedges ({wedges.length}): {wedges.length > 0 ? wedges.join(', ') : 'none'}
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
              <label htmlFor="study-night-game-type">Game type</label>
              <select
                id="study-night-game-type"
                value={selectedGameType}
                onChange={(event) => setSelectedGameType(normalizeGameType(event.target.value))}
                disabled={!canPickCategory}
              >
                <option value="mcq">MCQ</option>
                <option value="reverse">Reverse</option>
              </select>
              <div className="button-row game-wrap">
                {studyNightCategories.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => void handlePickCategory(category.key)}
                    disabled={!canPickCategory}
                  >
                    {category.key}: {category.label}
                  </button>
                ))}
              </div>
              {!canPickCategory ? (
                <p className="muted">Only the current player can pick (host can override).</p>
              ) : null}
            </>
          ) : null}

          {room.status === 'running' && state?.phase === 'question' ? (
            <>
              <h2>Quickfire {currentGameTypeLabel}</h2>
              <p className="muted">
                Category: {currentCategory ? `${currentCategory.key} (${currentCategory.prefix})` : 'n/a'}
              </p>
              <p className="muted">Time left: {secondsLeft}s</p>
              {question ? (
                <>
                  <p className="runner-prompt">{question.prompt}</p>
                  <div className="choice-list">
                    {(question.choices || []).map((choice, index) => {
                      const isSelected = selectedAnswerIndex === index;
                      return (
                        <button
                          key={`${question.id}-${index}`}
                          type="button"
                          className={`choice-btn${isSelected ? ' selected' : ''}`}
                          disabled={Boolean(submittedByQuestion[question.id])}
                          onClick={() => void handleSubmitAnswer(index)}
                        >
                          {String(choice)}
                        </button>
                      );
                    })}
                  </div>
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
                  <p className="muted">
                    Correct answer: {(question.choices || [])[question.correct_index] ?? 'Unknown'}
                  </p>
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
            </>
          ) : null}
        </div>
      </div>

      <p className="muted">Your wedges: {myWedges.length > 0 ? myWedges.join(', ') : 'none'}</p>
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
