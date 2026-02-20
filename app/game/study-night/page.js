'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';
import { postgrestFetch } from '../../../src/lib/postgrestFetch';
import { devLog } from '../../../src/lib/devLog';
import { useAuth } from '../../../src/providers/AuthProvider';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function createRoomCode(length = 6) {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * CODE_CHARS.length);
    value += CODE_CHARS[index];
  }
  return value;
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

function getStepTimestamp() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
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

function maskAnonKey(key) {
  if (!key || typeof key !== 'string') return 'missing';
  const trimmed = key.trim();
  if (!trimmed) return 'missing';
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
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

async function upsertPlayerMembership(roomId, user, timeoutMs = 8000, label = 'upsert_player') {
  const nowIso = new Date().toISOString();
  const insertResponse = await withTimeout(
    postgrestFetch('study_room_players', {
      method: 'POST',
      body: {
        room_id: roomId,
        user_id: user.id,
        display_name: getDefaultDisplayName(user),
        last_seen_at: nowIso,
      },
      headers: { prefer: 'return=representation' },
    }),
    timeoutMs,
    `${label}:insert`
  );

  if (insertResponse.ok) return { insertResponse, updateResponse: null };

  const insertError = toPostgrestError(insertResponse, 'Failed to insert room player.');
  if (!(insertResponse.status === 409 || insertError.code === '23505')) {
    throw insertError;
  }

  const updateResponse = await withTimeout(
    postgrestFetch(`study_room_players?room_id=eq.${roomId}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      body: { last_seen_at: nowIso },
    }),
    timeoutMs,
    `${label}:update`
  );
  if (!updateResponse.ok) {
    throw toPostgrestError(updateResponse, 'Failed to update room player.');
  }
  return { insertResponse, updateResponse };
}

export default function StudyNightLandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [errorInfo, setErrorInfo] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionReport, setConnectionReport] = useState(null);

  const normalizedJoinCode = useMemo(
    () => joinCodeInput.trim().toUpperCase(),
    [joinCodeInput]
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const maskedAnonKey = maskAnonKey(supabaseAnonKey);
  const authHeaders = useMemo(
    () =>
      supabaseAnonKey
        ? {
            apikey: supabaseAnonKey,
            authorization: `Bearer ${supabaseAnonKey}`,
          }
        : null,
    [supabaseAnonKey]
  );

  async function runFetchCheck(url, headers, label) {
    if (!url) {
      return {
        ok: false,
        status: '',
        text: 'Missing URL.',
      };
    }
    if (!headers) {
      return {
        ok: false,
        status: '',
        text: 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      };
    }

    try {
      const response = await withTimeout(fetch(url, { headers }), 8000, `${label}:fetch`);
      let responseText = '';
      try {
        responseText = await withTimeout(response.text(), 8000, `${label}:text`);
      } catch (textError) {
        responseText = toErrorInfo(textError, 'Failed to read response body.').message;
      }

      return {
        ok: response.ok,
        status: String(response.status || ''),
        text: String(responseText || '').slice(0, 120),
      };
    } catch (error) {
      const info = toErrorInfo(error, `${label} failed.`);
      return {
        ok: false,
        status: info.status,
        text: info.message,
      };
    }
  }

  async function runSupabaseHealthCheck() {
    return runFetchCheck(`${supabaseUrl}/auth/v1/health`, authHeaders, 'supabase_health');
  }

  async function runRestRootCheck() {
    return runFetchCheck(`${supabaseUrl}/rest/v1/`, authHeaders, 'supabase_rest_root');
  }

  async function runRestStudyRoomsCheck() {
    return runFetchCheck(
      `${supabaseUrl}/rest/v1/study_rooms?select=id&limit=1`,
      authHeaders,
      'supabase_rest_study_rooms'
    );
  }

  async function runStudyRoomsCheck() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        status: '',
        code: '',
        message: 'Supabase client unavailable.',
        details: '',
        hint: '',
      };
    }

    try {
      const response = await withTimeout(
        supabase.from('study_rooms').select('id').limit(1),
        8000,
        'study_rooms_select'
      );
      const error = response?.error || null;
      const errorInfo = error ? toErrorInfo(error, 'study_rooms select failed.') : null;

      return {
        ok: !error,
        status:
          typeof response?.status === 'number' || typeof response?.status === 'string'
            ? String(response.status)
            : errorInfo?.status || '',
        code: errorInfo?.code || '',
        message: errorInfo?.message || 'Query succeeded.',
        details: errorInfo?.details || '',
        hint: errorInfo?.hint || '',
      };
    } catch (error) {
      const info = toErrorInfo(error, 'study_rooms check failed.');
      return {
        ok: false,
        status: info.status,
        code: info.code,
        message: info.message,
        details: info.details,
        hint: info.hint,
      };
    }
  }

  async function handleCheckSupabaseConnection() {
    setCheckingConnection(true);
    setConnectionReport(null);

    try {
      const [health, restRoot, restStudyRooms, table] = await Promise.all([
        runSupabaseHealthCheck(),
        runRestRootCheck(),
        runRestStudyRoomsCheck(),
        runStudyRoomsCheck(),
      ]);

      const report = {
        checkedAt: new Date().toISOString(),
        env: {
          url: supabaseUrl || 'missing',
          anonKeyMasked: maskedAnonKey,
          anonKeyPresent: Boolean(supabaseAnonKey),
        },
        health,
        restRoot,
        restStudyRooms,
        table,
      };
      devLog('[STUDY-NIGHT] connection report', report);
      setConnectionReport(report);
    } finally {
      setCheckingConnection(false);
    }
  }

  async function handleCreateRoom() {
    if (!user) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorInfo(toErrorInfo({ message: 'Supabase is not configured.' }));
      return;
    }

    let didRedirect = false;
    const timeoutMs = 8000;
    const setStep = (stepName) => {
      setCreateStep(stepName);
      devLog('[STUDY-NIGHT] create step', stepName, getStepTimestamp());
    };

    setCreating(true);
    setStep('insert_room');
    setErrorInfo(null);

    try {
      let createdRoom = null;

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const code = createRoomCode();
        setStep('insert_room');
        const insertRoomResponse = await withTimeout(
          postgrestFetch('study_rooms', {
            method: 'POST',
            body: {
              code,
              host_user_id: user.id,
              status: 'lobby',
            },
            headers: { prefer: 'return=representation' },
          }),
          timeoutMs,
          'insert_room'
        );
        devLog(
          '[STUDY-NIGHT] create insert_room status',
          `attempt=${attempt}`,
          `status=${insertRoomResponse?.status ?? 'n/a'}`
        );
        devLog('[STUDY-NIGHT] create insert_room response', insertRoomResponse);
        if (insertRoomResponse.ok) {
          const roomRows = Array.isArray(insertRoomResponse.data)
            ? insertRoomResponse.data
            : [];
          createdRoom = roomRows[0] || null;
          break;
        }

        const roomInsertError = toPostgrestError(
          insertRoomResponse,
          'Failed to insert study room.'
        );
        const errorText = String(insertRoomResponse?.errorText || '').toLowerCase();
        const isUniqueConflict =
          insertRoomResponse.status === 409 ||
          roomInsertError.code === '23505' ||
          errorText.includes('duplicate') ||
          errorText.includes('unique');
        if (!isUniqueConflict) {
          throw roomInsertError;
        }
      }

      if (!createdRoom) {
        throw new Error('Could not generate a unique room code. Try again.');
      }

      setStep('upsert_host_player');
      const playerUpsertResponse = await upsertPlayerMembership(
        createdRoom.id,
        user,
        timeoutMs,
        'upsert_host_player'
      );
      devLog('[STUDY-NIGHT] create upsert_host_player response', playerUpsertResponse);

      setStep('upsert_room_state');
      const stateResponse = await withTimeout(
        postgrestFetch('study_room_state?on_conflict=room_id', {
          method: 'POST',
          body: {
            room_id: createdRoom.id,
            phase: 'pick',
            turn_index: 0,
            round_no: 1,
            category_key: null,
            question_id: null,
            started_at: null,
            duration_sec: 12,
          },
          headers: { prefer: 'resolution=merge-duplicates,return=representation' },
        }),
        timeoutMs,
        'upsert_room_state'
      );
      devLog('[STUDY-NIGHT] create upsert_room_state response', stateResponse);
      if (!stateResponse.ok) {
        throw toPostgrestError(stateResponse, 'Failed to upsert room state.');
      }
      setStep('redirect');
      didRedirect = true;
      router.replace(`/game/study-night/room/${createdRoom.code}`);
    } catch (error) {
      devLog('[STUDY-NIGHT] create room failed', error);
      setErrorInfo(toErrorInfo(error, 'Failed to create room.'));
    } finally {
      setCreating(false);
      if (!didRedirect) {
        setCreateStep('');
      }
    }
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    if (!user) return;
    if (!normalizedJoinCode) {
      setErrorInfo(toErrorInfo({ message: 'Enter a room code.' }));
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorInfo(toErrorInfo({ message: 'Supabase is not configured.' }));
      return;
    }

    setBusyAction('join');
    setErrorInfo(null);

    try {
      const roomResponse = await withTimeout(
        postgrestFetch(
          `study_rooms?code=eq.${encodeURIComponent(
            normalizedJoinCode
          )}&select=id,code,host_user_id,status&limit=1`
        ),
        8000,
        'join_room_select'
      );
      devLog('[STUDY-NIGHT] join room select response', roomResponse);
      if (!roomResponse.ok) {
        throw toPostgrestError(roomResponse, 'Failed to load room by code.');
      }

      const roomRows = Array.isArray(roomResponse.data) ? roomResponse.data : [];
      const room = roomRows[0] || null;
      if (!room) {
        setErrorInfo(toErrorInfo({ message: 'Room not found.' }));
        return;
      }

      const joinPlayerUpsertResponse = await upsertPlayerMembership(
        room.id,
        user,
        8000,
        'join_room_player'
      );
      devLog('[STUDY-NIGHT] join room upsert_player response', joinPlayerUpsertResponse);
      router.push(`/game/study-night/room/${room.code}`);
    } catch (error) {
      devLog('[STUDY-NIGHT] join room failed', error);
      setErrorInfo(toErrorInfo(error, 'Failed to join room.'));
    } finally {
      setBusyAction('');
    }
  }

  if (loading) {
    return (
      <section>
        <h1>Study Night</h1>
        <p className="muted">Loading session...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section>
        <h1>Study Night</h1>
        <p className="muted">Redirecting to sign in...</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Study Night</h1>
      <p>Multiplayer Trivial-Pursuit style MBLEX practice.</p>

      <div className="game-grid">
        <div className="game-card">
          <h2>Create Room</h2>
          <p className="muted">Start a new lobby and invite friends with a code.</p>
          <button type="button" onClick={handleCreateRoom} disabled={creating}>
            {creating ? 'Creating...' : 'Create room'}
          </button>
          {creating ? <p className="muted">Step: {createStep || 'insert_room'}</p> : null}
        </div>

        <div className="game-card">
          <h2>Join Room</h2>
          <form className="auth-form" onSubmit={handleJoinRoom}>
            <label htmlFor="join-code">Room code</label>
            <input
              id="join-code"
              type="text"
              value={joinCodeInput}
              onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              autoComplete="off"
            />
            <button type="submit" disabled={busyAction === 'join'}>
              {busyAction === 'join' ? 'Joining...' : 'Join room'}
            </button>
          </form>
        </div>
      </div>

      <div className="game-card">
        <h2>Diagnostics</h2>
        <div className="muted">
          <p>Env URL: {supabaseUrl || 'missing'}</p>
          <p>Env ANON key: {maskedAnonKey}</p>
        </div>
        <button
          type="button"
          onClick={handleCheckSupabaseConnection}
          disabled={checkingConnection}
        >
          {checkingConnection ? 'Checking...' : 'Check Supabase Connection'}
        </button>
        {connectionReport ? (
          <div className="muted">
            <p>Checked: {connectionReport.checkedAt}</p>
            <p>
              Env report url={connectionReport.env.url || 'missing'} anonKeyMasked=
              {connectionReport.env.anonKeyMasked || 'missing'} anonKeyPresent=
              {String(connectionReport.env.anonKeyPresent)}
            </p>
            <p>
              Auth health (apikey) ok={String(connectionReport.health.ok)} status=
              {connectionReport.health.status || 'n/a'} text=
              {connectionReport.health.text || 'n/a'}
            </p>
            <p>
              REST root ok={String(connectionReport.restRoot.ok)} status=
              {connectionReport.restRoot.status || 'n/a'} text=
              {connectionReport.restRoot.text || 'n/a'}
            </p>
            <p>
              REST study_rooms ok={String(connectionReport.restStudyRooms.ok)} status=
              {connectionReport.restStudyRooms.status || 'n/a'} text=
              {connectionReport.restStudyRooms.text || 'n/a'}
            </p>
            <p>
              supabase-js study_rooms ok={String(connectionReport.table.ok)} status=
              {connectionReport.table.status || 'n/a'} code=
              {connectionReport.table.code || 'n/a'} message=
              {connectionReport.table.message || 'n/a'}
            </p>
            {connectionReport.table.details ? (
              <p>study_rooms details={connectionReport.table.details}</p>
            ) : null}
            {connectionReport.table.hint ? (
              <p>study_rooms hint={connectionReport.table.hint}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {errorInfo ? (
        <div className="status error">
          <p>{errorInfo.message}</p>
          {errorInfo.details ? <p>Details: {errorInfo.details}</p> : null}
          {errorInfo.hint ? <p>Hint: {errorInfo.hint}</p> : null}
          {errorInfo.code ? <p>Code: {errorInfo.code}</p> : null}
          {errorInfo.status ? <p>Status: {errorInfo.status}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
