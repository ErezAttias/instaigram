'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { THEMES, type CarouselTheme } from './themes'
import { FloatingCarousel } from './FloatingCarousel'
import { AuroraBackdrop } from './AuroraBackdrop'
import { withAlpha } from './utils'

export const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
export const SERIF = "'Instrument Serif', 'Times New Roman', serif"
export const SANS = "'Inter', system-ui, -apple-system, sans-serif"

type Props = {
  /**
   * Left-column content. Wrap each phase in a unique `key` so the shell can
   * animate enter/exit between them. The shell itself stays mounted.
   */
  children: ReactNode
  /**
   * Optional explicit theme for the right-column preview. Supplying this
   * stops the demo auto-rotation and pins the preview to this theme — useful
   * when the preview reflects a real, user-chosen carousel.
   */
  preview?: CarouselTheme
  /**
   * When no preview is provided, the shell rotates through demo themes.
   * Pause the rotation with `paused`. Useful when the user has just
   * committed and we want the moment to feel held.
   */
  paused?: boolean
  /**
   * Optional override for the entire right-column contents. When provided,
   * the default aurora + floating carousel is replaced — use this once the
   * preview reflects a live carousel job with real slides and images.
   * The aurora backdrop is kept underneath unless `bareRight` is set.
   */
  rightContent?: ReactNode
  /** Hide the aurora backdrop when using `rightContent`. */
  bareRight?: boolean
  /** Hide the right column on mobile (below lg). Use when the left column is
   *  already showing the preview so the stacked duplicate is unnecessary. */
  hideRightOnMobile?: boolean
}

export function KhromaShell({ children, preview, paused = false, rightContent, bareRight = false, hideRightOnMobile = false }: Props) {
  const { theme, toggle } = useTheme()
  const isLight = theme === 'light'
  const [themeIdx, setThemeIdx] = useState(0)
  const [nonce, setNonce] = useState(0)

  // Demo-theme rotation runs only when no explicit preview is pinned.
  useEffect(() => {
    if (preview || paused) return
    const t = setInterval(() => {
      setThemeIdx(i => (i + 1) % THEMES.length)
      setNonce(n => n + 1)
    }, 5000)
    return () => clearInterval(t)
  }, [preview, paused])

  const pageBg = isLight ? '#f4f1ec' : '#000000'
  const textMain = isLight ? '#0a0a0a' : '#ffffff'
  const current = preview ?? THEMES[themeIdx]
  // Pinned previews get a fresh morph-in by bumping nonce on swap.
  const previewKey = preview ? `pin-${preview.username}-${preview.headline.length}` : `demo-${nonce}`

  return (
    <div
      className="relative min-w-0 flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-screen"
      style={{ background: pageBg }}
    >
      {/* Left column */}
      <section className="relative z-10 flex flex-col justify-center px-8 sm:px-14 lg:px-20 py-16">
        <div className="max-w-[36rem] w-full mx-auto">
          {/* Logo: light-grey monochrome wordmark. No accent — the hero and
              submit pill carry the color; the logo stays quiet. Links home. */}
          {/* Use a native anchor (not next/link) so the click fully resets
              the page — pipeline phases like "sample-facts" keep state in the
              page component, and a soft SPA nav to "/" leaves the hero stuck. */}
          {/* Logo (E2): all-lowercase wordmark with both "ai" letters in
              heavier weight. Accent is a weight contrast only — fully
              monochrome, no color or slant. */}
          <a
            href="/"
            aria-label="instaigram — back to home"
            className="mb-10 w-fit text-2xl leading-none inline-block transition-opacity hover:opacity-80 focus:outline-none focus-visible:opacity-80"
            style={{
              color: textMain,
              fontFamily: SANS,
              fontWeight: 500,
              letterSpacing: '-0.035em',
            }}
          >
            inst<span style={{ fontWeight: 800 }}>ai</span>gram
          </a>
          {children}
        </div>
      </section>

      {/* Right column */}
      <div
        className={`right-col relative overflow-visible lg:overflow-hidden min-h-[60vh] lg:min-h-0 mt-8 lg:mt-0${hideRightOnMobile ? ' hidden lg:block' : ''}`}
        style={{
          // Mobile-only feather at the top blends the aurora into whichever
          // top-section bg is live (black in dark mode, cream in light).
          ['--feather-color' as string]: pageBg,
        }}
      >
        {!bareRight && <AuroraBackdrop theme={current} isLight={isLight} />}
        {/* z-10 keeps the carousel card above the mobile feather overlay
            (which sits at z-2 to dissolve the aurora edge). */}
        <div className="absolute inset-0 flex items-center justify-center px-8 py-4 sm:px-14 lg:p-8 z-10">
          {rightContent ?? <FloatingCarousel theme={current} nonce={previewKey} isLight={isLight} />}
        </div>
      </div>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        className="fixed top-5 right-5 lg:top-auto lg:right-auto lg:bottom-6 lg:left-6 z-30 h-9 w-9 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
          color: textMain,
        }}
      >
        {isLight ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
        )}
      </button>

      <style jsx global>{`
        .phase-panel {
          animation: phase-in 550ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes phase-in {
          0%   { opacity: 0; transform: translateY(8px); filter: blur(3px); }
          100% { opacity: 1; transform: translateY(0);   filter: blur(0); }
        }
        /* dots-anchor reserves a fixed-width slot so the animated dots
           never reflow the surrounding headline text. */
        .dots-anchor {
          display: inline-block;
          width: 0.9em;   /* enough for "..." at any font size */
          white-space: nowrap;
        }
        .dots-anchor .dots {
          display: inline;
          white-space: nowrap;
        }
        .dots::after {
          content: '';
          display: inline-block;
          animation: dots 1.4s steps(4, end) infinite;
        }
        @keyframes dots {
          0%   { content: ''; }
          25%  { content: '.'; }
          50%  { content: '..'; }
          75%  { content: '...'; }
          100% { content: ''; }
        }

        .carousel-float {
          animation: float 7s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        .carousel-morph {
          animation: morph-in 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .carousel-image {
          animation: image-in 1000ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        /* Mobile seam fix: on stacked layouts, fade 140px of the top-section
           bg into the aurora so the vertical boundary dissolves. Desktop is
           a horizontal split and doesn't need it. */
        .right-col::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 140px;
          pointer-events: none;
          z-index: 2;
          background: linear-gradient(
            180deg,
            var(--feather-color) 0%,
            color-mix(in srgb, var(--feather-color) 55%, transparent) 35%,
            transparent 100%
          );
        }
        @media (min-width: 1024px) {
          .right-col::before { display: none; }
        }

        /* Font sizes live on CSS vars set inline from the theme, so a media
           query can shrink every headline in one place without fighting
           inline styles. Keeps every demo title on two lines down to the
           375px iPhone SE viewport. */
        /* The user controls font-size directly via the size slider, but
           we still need a safety cap so a generous slider value doesn't
           overflow on a narrow card. font-size follows the slider's
           --h-size, capped only when the container is too small to
           hold it (12cqi ≈ 12% of the IG card width). */
        .carousel-float { container-type: inline-size; }
        .fc-headline { font-size: min(var(--h-size), 12cqi); }
        .fc-support  { font-size: min(var(--s-size), 5.5cqi); }
        .fc-cta      { font-size: min(var(--cta-size), 5.5cqi); }

        /* Default LiveCarousel width: cap at 380px / 80% of parent on
           desktop. On mobile, widen to match the body's 28rem column. */
        .carousel-float-width { width: min(380px, 80%); }
        @media (max-width: 480px) {
          .carousel-float-width { width: min(28rem, 100%); }
        }

        /* Mobile floating bottom sheet for the design panel. On lg+ the
           sheet wrapper is transparent and its children render inline. */
        .design-sheet {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 70;
          /* Cap at ~half the viewport so the carousel preview above stays
             visible while the user edits. The sheet's own body scrolls
             when content is taller than this. */
          max-height: 50vh;
          overflow-y: auto;
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
          padding: 0 1.25rem 1.5rem;
          box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.35);
          transform: translateY(100%);
          transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .design-sheet.design-sheet-open { transform: translateY(0); }
        .design-sheet-body { padding-top: 0.5rem; }
        @media (min-width: 1024px) {
          .design-sheet {
            position: static;
            max-height: none;
            overflow: visible;
            padding: 0;
            box-shadow: none;
            border-radius: 0;
            transform: none !important;
            background: transparent !important;
            transition: none;
          }
        }

        /* When the floating sheet is open on mobile, pin the carousel
           preview to the top of the viewport so the user can see edits
           live alongside the design tools. The card scales itself to fit
           the available top half of the viewport (50vh - chrome). */
        @media (max-width: 1023.98px) {
          body.sheet-open .carousel-float,
          body.sheet-open .carousel-float-width {
            position: fixed;
            top: env(safe-area-inset-top, 0);
            left: 50%;
            transform: translateX(-50%);
            z-index: 65;
            /* IG card is 4:5; sized off viewport height so it always
               fits the top half. Width is explicit (not auto) so the
               inline-size container query has a concrete value. */
            height: 50vh;
            width: min(calc(50vh * 4 / 5), calc(100vw - 2rem), 28rem) !important;
            max-height: 50vh;
            margin: 0;
          }
          body.sheet-open .carousel-float > div:first-of-type {
            height: 100%;
            width: 100%;
            border-radius: 14px;
          }
          /* When the sheet is open we want the user to see the SLIDE,
             not the Instagram chrome around it. Hide the simulated IG
             header / dot row / footer so the photo + headline overlay
             can fill the pinned card. */
          body.sheet-open .ig-chrome {
            display: none !important;
          }
        }
        .slide-swap-next, .slide-swap-prev {
          will-change: transform, opacity;
        }
        .slide-swap-next { animation: slide-swap-next 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .slide-swap-prev { animation: slide-swap-prev 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes slide-swap-next {
          0%   { opacity: 0; transform: translateX(70px); }
          100% { opacity: 1; transform: translateX(0);    }
        }
        @keyframes slide-swap-prev {
          0%   { opacity: 0; transform: translateX(-70px); }
          100% { opacity: 1; transform: translateX(0);     }
        }
        .crossfade {
          animation: crossfade 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: opacity, transform, filter;
        }
        .edit-chip {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-6px) scale(0.92);
          filter: blur(2px);
          transition:
            opacity 240ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
            filter 240ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, opacity, filter;
        }
        .edit-chip-from-top {
          transform: translateY(-8px) scale(0.9);
        }
        .edit-chip-from-side {
          transform: translate(12px, -4px) scale(0.9);
        }
        .group\/image:hover > .edit-chip,
        .group\/headline:hover > .edit-chip,
        .group\/support:hover > .edit-chip {
          opacity: 1;
          pointer-events: auto;
          transform: translate(0, 0) scale(1);
          filter: blur(0);
        }
        @keyframes crossfade {
          0%   { opacity: 0; transform: translateY(4px); filter: blur(3px); }
          60%  { filter: blur(0); }
          100% { opacity: 1; transform: translateY(0);   filter: blur(0); }
        }
        @keyframes morph-in {
          /* Blur removed: on a rounded card, Gaussian blur bleeds past the
             corner radius and reads as a 1px rim against the aurora backdrop
             during the first frames of load. */
          0%   { transform: translateY(10px) scale(0.97); opacity: 0.6; }
          100% { transform: translateY(0)    scale(1);    opacity: 1;   }
        }
        @keyframes image-in {
          0%   { transform: scale(1.06); }
          100% { transform: scale(1);    }
        }

        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          transition: background 1200ms ease;
          will-change: transform;
          mix-blend-mode: screen;
        }
        .aurora-light .aurora-blob,
        .aurora-light .aurora-prism {
          mix-blend-mode: multiply;
        }
        .aurora-light .aurora-blob { opacity: 0.55; }
        .aurora-light .aurora-prism { opacity: 0.45; }
        .blob-a { width: 80%; aspect-ratio: 1; top: -10%; left: 10%; animation: drift-a 22s ease-in-out infinite; opacity: 0.9; }
        .blob-b { width: 70%; aspect-ratio: 1; bottom: -15%; right: -10%; animation: drift-b 28s ease-in-out infinite; opacity: 0.85; }
        .blob-c { width: 60%; aspect-ratio: 1; top: 35%; left: -10%; animation: drift-c 26s ease-in-out infinite; opacity: 0.7; }
        .aurora-prism {
          position: absolute;
          inset: -25%;
          filter: blur(90px);
          transition: background 1200ms ease;
          mix-blend-mode: screen;
          animation: prism-spin 60s linear infinite;
        }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(8%, 10%) scale(1.1); }
          66%      { transform: translate(-6%, 4%) scale(0.95); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-10%, -12%) scale(1.15); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(14%, -6%) scale(1.08); }
        }
        @keyframes prism-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .carousel-float, .carousel-morph, .carousel-image,
          .slide-swap-next, .slide-swap-prev, .crossfade, .edit-chip,
          .aurora-blob, .aurora-prism, .phase-panel {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export { withAlpha, THEMES }
export type { CarouselTheme }
