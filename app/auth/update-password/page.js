'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';

function parseHashParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({
    type: '',
    message: 'Validating reset session...',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepareSession() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setStatus({
          type: 'error',
          message: 'Supabase is not configured. Check NEXT_PUBLIC_* environment values.',
        });
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = parseHashParams();

      const code = searchParams.get('code');
      const accessToken =
        searchParams.get('access_token') || hashParams.get('access_token');
      const refreshToken =
        searchParams.get('refresh_token') || hashParams.get('refresh_token');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus({ type: 'error', message: error.message });
          return;
        }
        setStatus({ type: 'success', message: 'Session ready. Set a new password.' });
        setIsReady(true);
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setStatus({ type: 'error', message: error.message });
          return;
        }
        setStatus({ type: 'success', message: 'Session ready. Set a new password.' });
        setIsReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        setStatus({ type: 'success', message: 'Session ready. Set a new password.' });
        setIsReady(true);
        return;
      }

      setStatus({
        type: 'error',
        message: 'Recovery session missing. Open the latest reset email link again.',
      });
    }

    prepareSession();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: '', message: '' });
    const supabase = getSupabaseClient();

    if (!supabase) {
      setStatus({
        type: 'error',
        message: 'Supabase is not configured. Check NEXT_PUBLIC_* environment values.',
      });
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus({ type: 'error', message: error.message });
      setIsSubmitting(false);
      return;
    }

    setStatus({
      type: 'success',
      message: 'Password updated. You can now sign in with your new password.',
    });
    setIsSubmitting(false);
  }

  return (
    <section className="auth-card">
      <h1>Update password</h1>
      <p>Set a new password for your account.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!isReady || isSubmitting}
        />
        <button type="submit" disabled={!isReady || isSubmitting}>
          {isSubmitting ? 'Updating...' : 'Update password'}
        </button>
      </form>
      {status.message ? (
        <p className={status.type === 'error' ? 'status error' : 'status success'}>
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
