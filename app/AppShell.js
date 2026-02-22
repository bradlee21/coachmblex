'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '../src/lib/supabaseClient';
import { devLog } from '../src/lib/devLog';
import { postgrestFetch } from '../src/lib/postgrestFetch';
import { useAuth } from '../src/providers/AuthProvider';

const NAV_ITEMS = [
  { href: '/today', label: 'Today', key: 't' },
  { href: '/review', label: 'Review', key: 'r' },
  { href: '/drill', label: 'Drill', key: 'd' },
  { href: '/game/study-night', label: 'Study Night', key: 'n' },
  { href: '/anatomy', label: 'Anatomy', key: 'a' },
  {
    href: '/admin/questions',
    label: 'Questions',
    key: 'q',
    roles: ['admin', 'questions_editor'],
  },
  { href: '/progress', label: 'Progress', key: 'p' },
  { href: '/settings', label: 'Settings', key: 's' },
];
const PROTECTED_ROUTES = new Set(NAV_ITEMS.map((item) => item.href));
const BETA_BANNER_DISMISSED_KEY = 'betaBannerDismissed';
const NAV_TEST_IDS = {
  '/today': 'nav-today',
  '/review': 'nav-review',
  '/drill': 'nav-drill',
  '/game/study-night': 'nav-study-night',
  '/anatomy': 'nav-anatomy',
  '/progress': 'nav-progress',
  '/settings': 'nav-settings',
};

function normalizeRole(value) {
  if (value === 'admin') return 'admin';
  if (value === 'questions_editor') return 'questions_editor';
  return 'user';
}

function canAccessNavItem(item, role) {
  if (!item?.roles || item.roles.length === 0) return true;
  const normalizedRole = normalizeRole(role);
  return item.roles.includes(normalizedRole);
}

function canAccessAdminRoute(pathname, role) {
  if (!pathname?.startsWith('/admin')) return true;
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'admin') return true;
  if (normalizedRole === 'questions_editor') {
    return pathname === '/admin/questions' || pathname.startsWith('/admin/questions/');
  }
  return false;
}

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

function withTimeout(promise, ms = 8000, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function getResponseErrorMessage(response, fallback = 'Failed to submit feedback.') {
  const payload =
    response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : null;
  const status = response?.status ? `HTTP ${response.status}` : 'Request failed';
  const detail = payload?.message || response?.errorText || fallback;
  return `${status}: ${detail}`;
}

function getStudyNightFeedbackContext(pathname) {
  if (typeof window === 'undefined') return null;
  if (!pathname?.startsWith('/game/study-night/room/')) return null;

  const raw = window.__coachMblexStudyNightDiagnostics;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  return {
    realtimeStatus: typeof raw.realtimeStatus === 'string' ? raw.realtimeStatus : '',
    lastSnapshotAt:
      typeof raw.lastSnapshotAt === 'number' && Number.isFinite(raw.lastSnapshotAt)
        ? raw.lastSnapshotAt
        : null,
    lastMutation:
      raw.lastMutation && typeof raw.lastMutation === 'object'
        ? {
            name:
              typeof raw.lastMutation.name === 'string' ? raw.lastMutation.name : '',
            ok:
              typeof raw.lastMutation.ok === 'boolean' || raw.lastMutation.ok === null
                ? raw.lastMutation.ok
                : null,
            status:
              typeof raw.lastMutation.status === 'number' ||
              typeof raw.lastMutation.status === 'string'
                ? raw.lastMutation.status
                : '',
            message:
              typeof raw.lastMutation.message === 'string'
                ? raw.lastMutation.message.slice(0, 240)
                : '',
          }
        : null,
    phase: typeof raw.phase === 'string' ? raw.phase : '',
    round_no:
      typeof raw.round_no === 'number' && Number.isFinite(raw.round_no)
        ? raw.round_no
        : null,
    turn_index:
      typeof raw.turn_index === 'number' && Number.isFinite(raw.turn_index)
        ? raw.turn_index
        : null,
  };
}

export default function AppShell({ children }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, role, loading, error, warning } = useAuth();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState({ type: '', message: '' });
  const [feedbackContextToCopy, setFeedbackContextToCopy] = useState(null);
  const [showBetaBanner, setShowBetaBanner] = useState(false);
  const isAuthRoute = pathname.startsWith('/auth');
  const isRootRoute = pathname === '/';
  const isPublicRoute = isAuthRoute || isRootRoute;
  const isAdminRoute = pathname?.startsWith('/admin');
  const isGameRoute = pathname?.startsWith('/game');
  const isProtectedRoute =
    !isPublicRoute && (PROTECTED_ROUTES.has(pathname) || isGameRoute || isAdminRoute);
  const hasAdminAccess = canAccessAdminRoute(pathname, role);
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canAccessNavItem(item, role)),
    [role]
  );

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

      const navItem = visibleNavItems.find((item) => item.key === key);
      if (!navItem) return;

      event.preventDefault();
      router.push(navItem.href);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, router, visibleNavItems]);

  useEffect(() => {
    devLog(`[AUTH] route=${pathname}`);
  }, [pathname]);

  useEffect(() => {
    if (!isProtectedRoute) return;
    devLog(
      `[AUTH] guard loading=${loading} user=${user?.id ? 'present' : 'none'} route=${pathname}`
    );
  }, [isProtectedRoute, loading, pathname, user?.id]);

  useEffect(() => {
    if (loading || !isProtectedRoute) return;
    if (!user) {
      router.replace('/auth/sign-in');
    }
  }, [loading, isProtectedRoute, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user || isAuthRoute) {
      setShowBetaBanner(false);
      return;
    }

    const dismissed = window.localStorage.getItem(BETA_BANNER_DISMISSED_KEY) === 'true';
    setShowBetaBanner(!dismissed);
  }, [isAuthRoute, user]);

  async function handleSignOut() {
    setIsReviewOpen(false);
    setIsFeedbackOpen(false);
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/auth/sign-in');
    router.refresh();
  }

  function openFeedbackModal() {
    setFeedbackStatus({ type: '', message: '' });
    setFeedbackMessage('');
    setFeedbackEmail(user?.email || '');
    setFeedbackContextToCopy(null);
    setIsFeedbackOpen(true);
  }

  function closeFeedbackModal() {
    if (feedbackSubmitting) return;
    setIsFeedbackOpen(false);
  }

  function dismissBetaBanner() {
    setShowBetaBanner(false);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BETA_BANNER_DISMISSED_KEY, 'true');
  }

  async function handleCopyFeedbackContext() {
    if (!feedbackContextToCopy) return;
    const canCopy =
      typeof navigator !== 'undefined' &&
      typeof navigator.clipboard?.writeText === 'function';
    if (!canCopy) {
      setFeedbackStatus({
        type: 'error',
        message: 'Clipboard API is unavailable. Copy failed.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(feedbackContextToCopy, null, 2));
      setFeedbackStatus({
        type: 'success',
        message: 'Context copied to clipboard.',
      });
    } catch (copyError) {
      const message =
        copyError instanceof Error ? copyError.message : 'Failed to copy context.';
      setFeedbackStatus({ type: 'error', message });
    }
  }

  async function handleSubmitFeedback(event) {
    event.preventDefault();
    if (!user?.id) return;

    const message = feedbackMessage.trim();
    if (!message) {
      setFeedbackStatus({ type: 'error', message: 'Message is required.' });
      return;
    }

    const context = {
      pathname,
      role: normalizeRole(role),
      submitted_at: new Date().toISOString(),
    };
    const studyNightContext = getStudyNightFeedbackContext(pathname);
    if (studyNightContext) {
      context.study_night = studyNightContext;
    }
    setFeedbackContextToCopy(context);
    setFeedbackSubmitting(true);
    setFeedbackStatus({ type: '', message: '' });

    try {
      const response = await withTimeout(
        postgrestFetch('feedback', {
          method: 'POST',
          body: {
            user_id: user.id,
            email: feedbackEmail.trim() || null,
            message,
            context,
          },
        }),
        8000,
        'feedback_insert'
      );

      if (!response.ok) {
        throw new Error(getResponseErrorMessage(response));
      }

      setFeedbackStatus({
        type: 'success',
        message: 'Thanks. Your feedback was submitted.',
      });
      setFeedbackMessage('');
      setFeedbackContextToCopy(null);
    } catch (submitError) {
      const errorMessage =
        submitError instanceof Error ? submitError.message : 'Failed to submit feedback.';
      devLog('[FEEDBACK] submit failed', errorMessage);
      setFeedbackStatus({
        type: 'error',
        message: `${errorMessage} You can copy context JSON below.`,
      });
    } finally {
      setFeedbackSubmitting(false);
    }
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

  if (isAdminRoute && !hasAdminAccess) {
    return <main className="auth-content">You do not have access to this area.</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">Coach MBLEx</h1>
        <nav aria-label="Primary">
          <ul className="nav-list">
            {visibleNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  className={`nav-link${pathname === item.href ? ' active' : ''}`}
                  href={item.href}
                  data-testid={NAV_TEST_IDS[item.href]}
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
        {user ? (
          <button type="button" className="feedback-trigger" onClick={openFeedbackModal}>
            Send feedback
          </button>
        ) : null}
      </aside>

      <main className={`content${pathname === '/today' ? ' content--today' : ''}`}>
        {showBetaBanner ? (
          <div className="beta-banner" data-testid="beta-banner">
            <p className="muted">
              Private Beta - things may break. Please use Send feedback if you hit issues.
            </p>
            <div className="button-row">
              <button type="button" onClick={openFeedbackModal}>
                Send feedback
              </button>
              <button type="button" onClick={dismissBetaBanner}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        {children}
      </main>
      {error ? <p className="status error">{error}</p> : null}
      {warning ? <p className="muted">{warning}</p> : null}

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

      {isFeedbackOpen ? (
        <div
          className="feedback-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeFeedbackModal();
            }
          }}
        >
          <section className="feedback-modal">
            <div className="drawer-header">
              <h2 id="feedback-title">Send Feedback</h2>
              <button type="button" onClick={closeFeedbackModal} disabled={feedbackSubmitting}>
                Close
              </button>
            </div>
            <p className="muted">
              Share what happened. We attach safe route and diagnostics context.
            </p>
            <form className="auth-form" onSubmit={handleSubmitFeedback}>
              <label htmlFor="feedback-message">Message</label>
              <textarea
                id="feedback-message"
                rows={5}
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                required
              />
              <label htmlFor="feedback-email">Email (optional)</label>
              <input
                id="feedback-email"
                type="email"
                value={feedbackEmail}
                onChange={(event) => setFeedbackEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button type="submit" disabled={feedbackSubmitting || !feedbackMessage.trim()}>
                {feedbackSubmitting ? 'Sending...' : 'Submit feedback'}
              </button>
            </form>
            {feedbackStatus.message ? (
              <p className={`status ${feedbackStatus.type === 'error' ? 'error' : 'success'}`}>
                {feedbackStatus.message}
              </p>
            ) : null}
            {feedbackStatus.type === 'error' && feedbackContextToCopy ? (
              <button type="button" onClick={handleCopyFeedbackContext}>
                Copy context JSON
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
