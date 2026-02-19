'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus({ type: 'error', message: error.message });
      setIsSubmitting(false);
      return;
    }

    setStatus({ type: 'success', message: 'Signed in successfully.' });
    router.replace('/today');
  }

  return (
    <section className="auth-card">
      <h1>Sign in</h1>
      <p>Sign in with your email and password.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      {status.message ? (
        <p className={status.type === 'error' ? 'status error' : 'status success'}>
          {status.message}
        </p>
      ) : null}
      <p>
        No account? <Link href="/auth/sign-up">Create one</Link>
      </p>
      <p>
        Forgot password? <Link href="/auth/reset-password">Reset it</Link>
      </p>
    </section>
  );
}
