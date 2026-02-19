'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  error: '',
  warning: '',
});

async function ensureProfile(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  if (!userId) return;

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    console.error('Failed to ensure profile row', error.message);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
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
      console.debug(`[AUTH] loading=${value} (${reason})`);
      setLoading(value);
    }

    function setSessionSafe(nextSession, reason) {
      if (!mountedRef.current) return;
      console.debug(
        `[AUTH] session=${nextSession?.user?.id ? 'present' : 'none'} (${reason})`
      );
      setSession(nextSession ?? null);
    }

    function setErrorSafe(message, reason) {
      if (!mountedRef.current) return;
      if (message) {
        console.debug(`[AUTH] error (${reason}): ${message}`);
      }
      setError(message || '');
    }

    function setWarningSafe(message, reason) {
      if (!mountedRef.current) return;
      if (message) {
        console.debug(`[AUTH] warning (${reason}): ${message}`);
      }
      setWarning(message || '');
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

      console.debug('[AUTH] getSession start');
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

        if (currentSession?.user?.id) {
          void ensureProfile(currentSession.user.id).catch((profileError) => {
            const message =
              profileError instanceof Error ? profileError.message : 'Profile sync failed.';
            setErrorSafe(message, 'ensureProfile/getSession');
          });
        }
      } catch (unhandledError) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const message =
          unhandledError instanceof Error ? unhandledError.message : 'Session load failed.';
        setErrorSafe(message, 'getSession/catch');
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
        console.debug(`[AUTH] onAuthStateChange ${event}`);
        setSessionSafe(nextSession ?? null, 'auth-change');
        setLoadingSafe(false, `auth-change/${event}`);
        setWarningSafe('', `auth-change/${event}`);
        clearAuthTimeout();

        if (nextSession?.user?.id) {
          try {
            await ensureProfile(nextSession.user.id);
          } catch (profileError) {
            const message =
              profileError instanceof Error
                ? profileError.message
                : 'Profile sync failed.';
            setErrorSafe(message, 'ensureProfile');
          }
        }
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
      loading,
      error,
      warning,
    }),
    [error, loading, session, warning]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
