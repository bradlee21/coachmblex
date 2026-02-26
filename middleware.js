import { NextResponse } from 'next/server';

const REMOVED_ROUTE_PREFIXES = [
  '/learn',
  '/practice',
  '/coach',
  '/game',
  '/boss-fight',
  '/streak',
  '/sprint',
  '/memory',
  '/flashcards',
  '/anatomy',
];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const shouldRedirect = REMOVED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!shouldRedirect) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/today';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/learn/:path*',
    '/practice/:path*',
    '/coach/:path*',
    '/game/:path*',
    '/boss-fight/:path*',
    '/streak/:path*',
    '/sprint/:path*',
    '/memory/:path*',
    '/flashcards/:path*',
    '/anatomy/:path*',
  ],
};
