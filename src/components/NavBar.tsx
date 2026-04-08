'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-[1800px] mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-foreground hover:text-accent transition-colors duration-200"
        >
          InstAIgram
        </Link>

        {/* Desktop nav links */}
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
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
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

      {/* Mobile dropdown */}
      {open && (
        <div className="lg:hidden border-t border-border/30 bg-background/10 backdrop-blur-sm">
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
      )}
    </nav>
  );
}
