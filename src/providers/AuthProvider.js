'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
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

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Failed to load session', error.message);
      }

      if (!isMounted) return;

      const currentSession = data?.session ?? null;
      setSession(currentSession);

      if (currentSession?.user?.id) {
        await ensureProfile(currentSession.user.id);
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    loadSession();

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession ?? null);

        if (nextSession?.user?.id) {
          await ensureProfile(nextSession.user.id);
        }

        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
