'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '../src/lib/supabaseClient';
import { useAuth } from '../src/providers/AuthProvider';

const NAV_ITEMS = [
  { href: '/today', label: 'Today', key: 't' },
  { href: '/review', label: 'Review', key: 'r' },
  { href: '/drill', label: 'Drill', key: 'd' },
  { href: '/anatomy', label: 'Anatomy', key: 'a' },
  { href: '/progress', label: 'Progress', key: 'p' },
  { href: '/settings', label: 'Settings', key: 's' },
];
const PROTECTED_ROUTES = new Set(NAV_ITEMS.map((item) => item.href));

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error } = useAuth();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const isAuthRoute = pathname.startsWith('/auth');
  const isProtectedRoute = PROTECTED_ROUTES.has(pathname);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const sessionPage =
        pathname === '/today' || pathname === '/drill' || pathname === '/review';
      if (sessionPage && ['1', '2', '3', '4', 's', 'k', 'g', 'enter'].includes(key)) {
        return;
      }

      if (key === 'escape') {
        setIsReviewOpen(false);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const navItem = NAV_ITEMS.find((item) => item.key === key);
      if (!navItem) return;

      event.preventDefault();
      router.push(navItem.href);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, router]);

  useEffect(() => {
    console.debug(`[SESSION] route=${pathname}`);
  }, [pathname]);

  useEffect(() => {
    if (loading || !isProtectedRoute) return;
    if (!user) {
      router.replace('/auth/sign-in');
    }
  }, [loading, isProtectedRoute, router, user]);

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace('/auth/sign-in');
  }

  if (isAuthRoute) {
    return <main className="auth-content">{children}</main>;
  }

  if (loading && isProtectedRoute) {
    return <main className="auth-content">Loading session...</main>;
  }

  if (!user && isProtectedRoute) {
    return <main className="auth-content">Redirecting to sign in...</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">Coach MBLEx</h1>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  className={`nav-link${pathname === item.href ? ' active' : ''}`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="review-pill"
          onClick={() => setIsReviewOpen((open) => !open)}
          aria-expanded={isReviewOpen}
          aria-controls="review-drawer"
        >
          Review (0)
        </button>
        {user ? (
          <button type="button" className="sign-out" onClick={handleSignOut}>
            Sign out
          </button>
        ) : null}
      </aside>

      <main className="content">{children}</main>
      {error ? <p className="status error">{error}</p> : null}

      <aside
        id="review-drawer"
        className={`drawer${isReviewOpen ? ' open' : ''}`}
        aria-hidden={!isReviewOpen}
      >
        <div className="drawer-header">
          <h2>Review Queue</h2>
          <button type="button" onClick={() => setIsReviewOpen(false)}>
            Close
          </button>
        </div>
        <p>No review cards queued yet.</p>
      </aside>
    </div>
  );
}
