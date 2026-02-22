'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { devLog, devWarn } from '../lib/devLog';

const AUTH_PROFILE_TIMEOUT_MS = 8000;
const AUTH_PROFILE_RETRY_DELAYS_MS = [2000, 5000];
const ensureProfileInFlight = new Map();

const AuthContext = createContext({
  user: null,
  session: null,
  role: 'user',
  loading: true,
  error: '',
  warning: '',
});

function withTimeout(promise, ms = AUTH_PROFILE_TIMEOUT_MS, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeRole(value) {
  if (value === 'admin') return 'admin';
  if (value === 'questions_editor') return 'questions_editor';
  return 'user';
}

async function ensureProfile(userId, context = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  if (!userId) return;
  const existing = ensureProfileInFlight.get(userId);
  if (existing) {
    devLog(
      `[AUTH] ensureProfile join event=${context.eventType || 'unknown'} user=${userId} reason=${
        context.reason || 'unknown'
      } attempt=${Number(context.attempt) || 1}`
    );
    return existing;
  }
  const startedAt = Date.now();
  const eventType = context.eventType || 'unknown';
  const reason = context.reason || 'unknown';
  const attempt = Number(context.attempt) || 1;
  const request = (async () => {
    devLog(
      `[AUTH] ensureProfile start event=${eventType} user=${userId} reason=${reason} attempt=${attempt}`
    );

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

    devLog(
      `[AUTH] ensureProfile done event=${eventType} user=${userId} reason=${reason} attempt=${attempt} ms=${
        Date.now() - startedAt
      }`
    );

    if (error) {
      devWarn('Failed to ensure profile row', error.message);
    }
  })();
  ensureProfileInFlight.set(userId, request);
  try {
    await request;
  } finally {
    if (ensureProfileInFlight.get(userId) === request) {
      ensureProfileInFlight.delete(userId);
    }
  }
}

async function fetchProfileRole(userId, context = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return 'user';
  const startedAt = Date.now();
  const eventType = context.eventType || 'unknown';
  const reason = context.reason || 'unknown';
  const attempt = Number(context.attempt) || 1;
  devLog(
    `[AUTH] fetchProfileRole start event=${eventType} user=${userId} reason=${reason} attempt=${attempt}`
  );

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  devLog(
    `[AUTH] fetchProfileRole done event=${eventType} user=${userId} reason=${reason} attempt=${attempt} ms=${
      Date.now() - startedAt
    }`
  );

  if (error) {
    devWarn('Failed to load profile role', error.message);
    return 'user';
  }

  return normalizeRole(data?.role);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef(null);
  const profileSyncInFlightRef = useRef(new Map());
  const profileRetryTimeoutsRef = useRef(new Map());

  useEffect(() => {
    mountedRef.current = true;

    function clearAuthTimeout() {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function clearProfileRetry(userId) {
      if (!userId) return;
      const timer = profileRetryTimeoutsRef.current.get(userId);
      if (timer) {
        clearTimeout(timer);
      }
      profileRetryTimeoutsRef.current.delete(userId);
    }

    function clearAllProfileRetries() {
      for (const timer of profileRetryTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      profileRetryTimeoutsRef.current.clear();
    }

    function setLoadingSafe(value, reason) {
      if (!mountedRef.current) return;
      devLog(`[AUTH] loading=${value} (${reason})`);
      setLoading(value);
    }

    function setSessionSafe(nextSession, reason) {
      if (!mountedRef.current) return;
      devLog(
        `[AUTH] session=${nextSession?.user?.id ? 'present' : 'none'} (${reason})`
      );
      setSession(nextSession ?? null);
    }

    function setRoleSafe(nextRole, reason) {
      if (!mountedRef.current) return;
      const normalized = normalizeRole(nextRole);
      devLog(`[AUTH] role=${normalized} (${reason})`);
      setRole(normalized);
    }

    function setErrorSafe(message, reason) {
      if (!mountedRef.current) return;
      if (message) {
        devLog(`[AUTH] error (${reason}): ${message}`);
      }
      setError(message || '');
    }

    function setWarningSafe(message, reason) {
      if (!mountedRef.current) return;
      if (message) {
        devLog(`[AUTH] warning (${reason}): ${message}`);
      }
      setWarning(message || '');
    }

    function isTimeoutProfileError(message) {
      return typeof message === 'string' && message.includes(`timed out after ${AUTH_PROFILE_TIMEOUT_MS}ms`);
    }

    function scheduleProfileSyncRetry(userId, reason, options = {}) {
      if (!mountedRef.current || !userId) return;
      const attemptIndex = Number(options.attemptIndex) || 0;
      const delayMs = AUTH_PROFILE_RETRY_DELAYS_MS[attemptIndex];
      if (!delayMs) return;
      clearProfileRetry(userId);
      devLog(
        `[AUTH] profile sync retry scheduled event=${options.eventType || 'unknown'} user=${userId} reason=${reason} retry=${
          attemptIndex + 1
        } delayMs=${delayMs}`
      );
      const timer = setTimeout(() => {
        profileRetryTimeoutsRef.current.delete(userId);
        if (!mountedRef.current) return;
        void syncProfileAndRole(userId, reason, {
          ...options,
          background: true,
          nonBlockingTimeout: true,
          attemptIndex: attemptIndex + 1,
        });
      }, delayMs);
      profileRetryTimeoutsRef.current.set(userId, timer);
    }

    async function syncProfileAndRole(userId, reason, options = {}) {
      if (!userId) {
        clearAllProfileRetries();
        setRoleSafe('user', `${reason}/no-session`);
        return;
      }

      const existingInFlight = profileSyncInFlightRef.current.get(userId);
      if (existingInFlight) {
        devLog(
          `[AUTH] profile sync join event=${options.eventType || 'unknown'} user=${userId} reason=${reason}`
        );
        return existingInFlight;
      }

      const attemptIndex = Number(options.attemptIndex) || 0;
      const attempt = attemptIndex + 1;
      const eventType = options.eventType || 'unknown';
      const isBackground = Boolean(options.background);
      const nonBlockingTimeout = Boolean(options.nonBlockingTimeout);

      if (!isBackground) {
        clearProfileRetry(userId);
      }

      const syncPromise = (async () => {
        const syncStartedAt = Date.now();
        devLog(
          `[AUTH] profile sync start event=${eventType} user=${userId} reason=${reason} attempt=${attempt} background=${isBackground}`
        );

        try {
          await withTimeout(
            ensureProfile(userId, {
              eventType,
              reason,
              attempt,
            }),
            AUTH_PROFILE_TIMEOUT_MS,
            `ensureProfile/${reason}`
          );
          const nextRole = await withTimeout(
            fetchProfileRole(userId, {
              eventType,
              reason,
              attempt,
            }),
            AUTH_PROFILE_TIMEOUT_MS,
            `fetchProfileRole/${reason}`
          );
          clearProfileRetry(userId);
          setErrorSafe('', `${reason}/success`);
          setWarningSafe('', `${reason}/success`);
          setRoleSafe(nextRole, reason);
          devLog(
            `[AUTH] profile sync success event=${eventType} user=${userId} reason=${reason} attempt=${attempt} ms=${
              Date.now() - syncStartedAt
            }`
          );
        } catch (profileError) {
          const message =
            profileError instanceof Error ? profileError.message : 'Profile sync failed.';
          const isTimeout = isTimeoutProfileError(message);
          devWarn(
            `[AUTH] profile sync error event=${eventType} user=${userId} reason=${reason} attempt=${attempt} timeout=${isTimeout}`,
            message
          );

          if (isTimeout && nonBlockingTimeout) {
            setErrorSafe('', `ensureProfile/${reason}/timeout-silent`);
            setRoleSafe('user', `${reason}/timeout-default`);
            scheduleProfileSyncRetry(userId, reason, {
              ...options,
              eventType,
              attemptIndex,
            });
            return;
          }

          setErrorSafe(message, `ensureProfile/${reason}`);
          if (isTimeout) {
            setWarningSafe(
              'Profile sync timed out. Continuing with default access.',
              `ensureProfile/${reason}`
            );
          } else if (isBackground) {
            setWarningSafe('', `ensureProfile/${reason}/background-error`);
          }
          setRoleSafe('user', `${reason}/error`);
        }
      })();

      profileSyncInFlightRef.current.set(userId, syncPromise);
      try {
        return await syncPromise;
      } finally {
        if (profileSyncInFlightRef.current.get(userId) === syncPromise) {
          profileSyncInFlightRef.current.delete(userId);
        }
      }
    }

    async function loadSession() {
      const requestId = ++requestIdRef.current;
      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorSafe('Supabase is not configured.', 'loadSession/no-client');
        setLoadingSafe(false, 'loadSession/no-client');
        clearAuthTimeout();
        return;
      }

      const getSessionStartedAt = Date.now();
      devLog('[AUTH] getSession start');
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        devLog(`[AUTH] getSession done ms=${Date.now() - getSessionStartedAt}`);
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (sessionError) {
          setErrorSafe(sessionError.message, 'getSession');
        } else {
          setErrorSafe('', 'getSession');
        }
        setWarningSafe('', 'getSession');

        const currentSession = data?.session ?? null;
        devLog(
          `[AUTH] getSession user-resolve ms=0 user=${currentSession?.user?.id || 'none'} event=GET_SESSION`
        );
        setSessionSafe(currentSession, 'getSession');

        await syncProfileAndRole(currentSession?.user?.id, 'getSession', {
          eventType: 'GET_SESSION',
          nonBlockingTimeout: false,
          background: false,
          attemptIndex: 0,
        });
      } catch (unhandledError) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const message =
          unhandledError instanceof Error ? unhandledError.message : 'Session load failed.';
        setErrorSafe(message, 'getSession/catch');
        setRoleSafe('user', 'getSession/catch');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoadingSafe(false, 'loadSession/finally');
          clearAuthTimeout();
        }
      }
    }

    setLoadingSafe(true, 'initial');
    setWarningSafe('', 'initial');

    const timeoutRequestId = requestIdRef.current + 1;
    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (requestIdRef.current !== timeoutRequestId) return;
      setWarningSafe('Auth check timed out. Refresh or re-sign in.', 'timeout');
      setLoadingSafe(false, 'timeout');
    }, 8000);
    loadSession();

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadingSafe(false, 'listener/no-client');
      return () => {
        mountedRef.current = false;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        devLog(`[AUTH] onAuthStateChange ${event}`);
        const authChangeUserResolveStartedAt = Date.now();
        const userId = nextSession?.user?.id || '';
        devLog(
          `[AUTH] auth-change user-resolve event=${event} user=${userId || 'none'} ms=${
            Date.now() - authChangeUserResolveStartedAt
          }`
        );
        setLoadingSafe(true, `auth-change/${event}/start`);
        setSessionSafe(nextSession ?? null, 'auth-change');
        setWarningSafe('', `auth-change/${event}`);
        clearAuthTimeout();

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          void syncProfileAndRole(userId, `auth-change/${event}`, {
            eventType: event,
            nonBlockingTimeout: true,
            background: false,
            attemptIndex: 0,
          });
          setLoadingSafe(false, `auth-change/${event}/done`);
          return;
        }

        await syncProfileAndRole(userId, `auth-change/${event}`, {
          eventType: event,
          nonBlockingTimeout: false,
          background: false,
          attemptIndex: 0,
        });
        setLoadingSafe(false, `auth-change/${event}/done`);
      }
    );

    return () => {
      mountedRef.current = false;
      clearAuthTimeout();
      clearAllProfileRetries();
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      role,
      loading,
      error,
      warning,
    }),
    [error, loading, role, session, warning]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
