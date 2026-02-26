'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MOBILE_NAV_ITEMS = [
  { href: '/today', label: 'Today' },
  { href: '/drill', label: 'Drill' },
  { href: '/test', label: 'Test' },
  { href: '/review', label: 'Review' },
];

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';

  if (
    pathname === '/' ||
    pathname === '/app' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/game/study-night/room/')
  ) {
    return null;
  }

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {MOBILE_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href ? 'active' : ''}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
