'use client';

import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex items-center w-[3.75rem] h-8 rounded-full border border-foreground/10 bg-foreground/6 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Sliding pill — rendered first so icons sit above it */}
      <span
        className="absolute top-1/2 w-6 h-6 rounded-full bg-foreground/[0.08] transition-transform duration-300"
        style={{ transform: isDark ? 'translate(33px, -50%)' : 'translate(3px, -50%)' }}
      />

      {/* Left half — Sun */}
      <span className="flex-1 flex items-center justify-center z-10">
        <svg
          className="w-4 h-4 transition-all duration-200"
          style={{ color: 'var(--foreground)', opacity: isDark ? 0.3 : 1 }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
        >
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </span>

      {/* Right half — Moon */}
      <span className="flex-1 flex items-center justify-center z-10">
        <svg
          className="w-4 h-4 transition-all duration-200"
          style={{ color: 'var(--foreground)', opacity: isDark ? 1 : 0.3 }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  );
}
