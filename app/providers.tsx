'use client';

import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';
import { CrossmarkProvider } from '@/lib/crossmark/CrossmarkProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <CrossmarkProvider>
      {children}
      </CrossmarkProvider>
    </ThemeProvider>
  );
}

