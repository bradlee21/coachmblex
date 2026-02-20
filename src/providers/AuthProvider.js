'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { devLog, devWarn } from '../lib/devLog';

const AUTH_PROFILE_TIMEOUT_MS = 8000;

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

async function ensureProfile(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  if (!userId) return;

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    devWarn('Failed to ensure profile row', error.message);
  }
}

async function fetchProfileRole(userId) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return 'user';

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

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

  useEffect(() => {
    mountedRef.current = true;

    function clearAuthTimeout() {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
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

    async function syncProfileAndRole(userId, reason) {
      if (!userId) {
        setRoleSafe('user', `${reason}/no-session`);
        return;
      }

      try {
        await withTimeout(
          ensureProfile(userId),
          AUTH_PROFILE_TIMEOUT_MS,
          `ensureProfile/${reason}`
        );
        const nextRole = await withTimeout(
          fetchProfileRole(userId),
          AUTH_PROFILE_TIMEOUT_MS,
          `fetchProfileRole/${reason}`
        );
        setRoleSafe(nextRole, reason);
      } catch (profileError) {
        const message =
          profileError instanceof Error ? profileError.message : 'Profile sync failed.';
        setErrorSafe(message, `ensureProfile/${reason}`);
        setWarningSafe(
          'Profile sync timed out. Continuing with default access.',
          `ensureProfile/${reason}`
        );
        setRoleSafe('user', `${reason}/error`);
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

      devLog('[AUTH] getSession start');
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (sessionError) {
          setErrorSafe(sessionError.message, 'getSession');
        } else {
          setErrorSafe('', 'getSession');
        }
        setWarningSafe('', 'getSession');

        const currentSession = data?.session ?? null;
        setSessionSafe(currentSession, 'getSession');

        await syncProfileAndRole(currentSession?.user?.id, 'getSession');
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
        setLoadingSafe(true, `auth-change/${event}/start`);
        setSessionSafe(nextSession ?? null, 'auth-change');
        setWarningSafe('', `auth-change/${event}`);
        clearAuthTimeout();

        await syncProfileAndRole(nextSession?.user?.id, `auth-change/${event}`);
        setLoadingSafe(false, `auth-change/${event}/done`);
      }
    );

    return () => {
      mountedRef.current = false;
      clearAuthTimeout();
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
