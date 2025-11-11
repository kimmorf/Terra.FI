'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useCrossmark } from './useCrossmark';
import type { CrossmarkContextValue } from './types';

const CrossmarkContext = createContext<CrossmarkContextValue | undefined>(
  undefined,
);

export function CrossmarkProvider({ children }: { children: ReactNode }) {
  const value = useCrossmark();

  return (
    <CrossmarkContext.Provider value={value}>
      {children}
    </CrossmarkContext.Provider>
  );
}

export function useCrossmarkContext(): CrossmarkContextValue {
  const context = useContext(CrossmarkContext);

  if (context === undefined) {
    throw new Error(
      'useCrossmarkContext deve ser utilizado dentro de um CrossmarkProvider.',
    );
  }

  return context;
}
