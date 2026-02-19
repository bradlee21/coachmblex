'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  error: '',
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
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    function setLoadingSafe(value, reason) {
      if (!mountedRef.current) return;
      console.debug(`[SESSION] loading=${value} (${reason})`);
      setLoading(value);
    }

    function setSessionSafe(nextSession, reason) {
      if (!mountedRef.current) return;
      console.debug(
        `[SESSION] session=${nextSession?.user?.id ? 'present' : 'none'} (${reason})`
      );
      setSession(nextSession ?? null);
    }

    function setErrorSafe(message, reason) {
      if (!mountedRef.current) return;
      if (message) {
        console.debug(`[SESSION] error (${reason}): ${message}`);
      }
      setError(message || '');
    }

    async function loadSession() {
      const requestId = ++requestIdRef.current;
      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorSafe('Supabase is not configured.', 'loadSession/no-client');
        setLoadingSafe(false, 'loadSession/no-client');
        return;
      }

      console.debug('[SESSION] getSession start');
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (sessionError) {
          setErrorSafe(sessionError.message, 'getSession');
        } else {
          setErrorSafe('', 'getSession');
        }

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
        }
      }
    }

    setLoadingSafe(true, 'initial');
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
        console.debug(`[SESSION] onAuthStateChange ${event}`);
        setSessionSafe(nextSession ?? null, 'auth-change');
        setLoadingSafe(false, `auth-change/${event}`);

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
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      error,
    }),
    [error, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
