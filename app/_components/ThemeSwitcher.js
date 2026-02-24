'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <label className="theme-switcher">
      <span>Theme:</span>
      <select
        className="theme-switcher__select choice-btn"
        value={mounted ? theme || 'system' : 'system'}
        onChange={(event) => setTheme(event.target.value)}
        aria-label="Theme"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
