'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/today', label: 'Today', key: 't' },
  { href: '/review', label: 'Review', key: 'r' },
  { href: '/drill', label: 'Drill', key: 'd' },
  { href: '/anatomy', label: 'Anatomy', key: 'a' },
  { href: '/progress', label: 'Progress', key: 'p' },
  { href: '/settings', label: 'Settings', key: 's' },
];

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
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

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
  }, [router]);

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
      </aside>

      <main className="content">{children}</main>

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
