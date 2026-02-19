export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
}
