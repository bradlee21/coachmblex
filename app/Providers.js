'use client';

import { AuthProvider } from '../src/providers/AuthProvider';

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
