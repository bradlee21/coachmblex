'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';
import { getSiteUrl } from '../../../src/lib/siteUrl';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
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

    const redirectTo = `${getSiteUrl()}/auth/update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setStatus({ type: 'error', message: error.message });
      setIsSubmitting(false);
      return;
    }

    setStatus({
      type: 'success',
      message: 'Password reset email sent. Check your inbox.',
    });
    setIsSubmitting(false);
  }

  return (
    <section className="auth-card">
      <h1>Reset password</h1>
      <p>Enter your account email and we will send a reset link.</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      {status.message ? (
        <p className={status.type === 'error' ? 'status error' : 'status success'}>
          {status.message}
        </p>
      ) : null}
      <p>
        Back to <Link href="/auth/sign-in">sign in</Link>
      </p>
    </section>
  );
}
