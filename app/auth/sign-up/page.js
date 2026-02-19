'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';

export default function SignUpPage() {
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

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setStatus({ type: 'error', message: error.message });
      setIsSubmitting(false);
      return;
    }

    setStatus({
      type: 'success',
      message:
        'Account created. Check your email for confirmation if your project requires it.',
    });
    setIsSubmitting(false);
    router.replace('/today');
  }

  return (
    <section className="auth-card">
      <h1>Sign up</h1>
      <p>Create your account with email and password.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="sign-up-email">Email</label>
        <input
          id="sign-up-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="sign-up-password">Password</label>
        <input
          id="sign-up-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      {status.message ? (
        <p className={status.type === 'error' ? 'status error' : 'status success'}>
          {status.message}
        </p>
      ) : null}
      <p>
        Already have an account? <Link href="/auth/sign-in">Sign in</Link>
      </p>
    </section>
  );
}
