'use client';

import { useState } from 'react';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-sm" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
      <div className="max-w-[1800px] mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-[27px] font-semibold tracking-tight font-[family-name:var(--font-bricolage)] bg-clip-text text-transparent"
          style={{ backgroundImage: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}
        >
          InstAIgram
        </Link>

        {/* Desktop nav links + theme toggle */}
        <div className="hidden lg:flex items-center gap-6">
          <Link
            href="/admin"
            className="text-sm font-medium text-muted-light hover:text-foreground transition-colors duration-200"
          >
            Dashboard
          </Link>
          <Link
            href="/carousel"
            className="text-sm font-medium text-muted-light hover:text-foreground transition-colors duration-200"
          >
            Create Carousel
          </Link>
          <ThemeToggle />
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="lg:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            className="flex items-center justify-center w-11 h-11 p-2.5 rounded-lg text-foreground hover:bg-surface-hover transition-colors"
            onClick={() => setOpen(o => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown — animated height via CSS grid */}
      <div
        className="lg:hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/30 bg-background/90 backdrop-blur-md">
            <div className="max-w-[1800px] mx-auto px-6 py-3 flex flex-col gap-1">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center h-11 px-3 rounded-lg text-sm font-medium text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/carousel"
                onClick={() => setOpen(false)}
                className="flex items-center h-11 px-3 rounded-lg text-sm font-medium text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                Create Carousel
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
