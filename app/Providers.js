'use client';

import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '../src/providers/AuthProvider';

export default function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
