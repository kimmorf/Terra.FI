'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="fixed top-4 right-4 z-50 p-3 rounded-full bg-gray-200 dark:bg-gray-800" />
    );
  }

  const currentTheme = resolvedTheme || theme || 'dark';
  const isDark = currentTheme === 'dark';

  return (
    <button
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark');
      }}
      className="fixed top-4 right-4 z-50 p-3 rounded-full bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl"
      aria-label="Toggle theme"
      type="button"
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-yellow-500" />
      ) : (
        <Moon className="w-5 h-5 text-blue-600" />
      )}
    </button>
  );
}

