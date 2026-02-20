'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../src/providers/AuthProvider';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/today' : '/auth/sign-in');
  }, [loading, router, user]);

  return (
    <main className="auth-content">
      {loading ? 'Loading session...' : 'Redirecting...'}
    </main>
  );
}
