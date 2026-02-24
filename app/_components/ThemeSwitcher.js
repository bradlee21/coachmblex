'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [systemTheme, setSystemTheme] = useState('light');

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
    </label>
  );
}
