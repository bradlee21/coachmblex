'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export default function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [systemTheme, setSystemTheme] = useState('light');
  const [htmlClassName, setHtmlClassName] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const update = () => setHtmlClassName(root.className || '');
    update();

    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const selectedTheme = mounted ? theme || 'system' : 'system';

  return (
    <label className="theme-switcher">
      <span>Theme:</span>
      <select
        className="theme-switcher__select choice-btn"
        value={selectedTheme}
        onChange={(event) => setTheme(event.target.value)}
        aria-label="Theme"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
      {selectedTheme === 'system' ? (
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          ({systemTheme === 'dark' ? 'Dark' : 'Light'})
        </span>
      ) : null}
      {process.env.NODE_ENV !== 'production' ? (
        <span className="muted" style={{ display: 'block', width: '100%', fontSize: '0.8rem' }}>
          theme={String(theme || 'system')} | resolved={String(resolvedTheme || '')} | html=
          {htmlClassName || '(none)'}
        </span>
      ) : null}
    </label>
  );
}
