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
}

export function KhromaShell({ children, preview, paused = false }: Props) {
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
        <div className="max-w-[36rem] w-full">
          <div
            className="mb-10 bg-clip-text text-transparent w-fit text-2xl font-semibold tracking-tight font-[family-name:var(--font-bricolage)]"
            style={{ backgroundImage: IG_GRADIENT }}
          >
            InstAIgram
          </div>
          {children}
        </div>
      </section>

      {/* Right column */}
      <div className="relative overflow-hidden min-h-[60vh] lg:min-h-0">
        <AuroraBackdrop theme={current} />
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <FloatingCarousel theme={current} nonce={previewKey} />
        </div>
      </div>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
        className="fixed bottom-6 left-6 z-30 h-9 w-9 rounded-full flex items-center justify-center transition-colors"
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
        @keyframes morph-in {
          0%   { transform: translateY(10px) scale(0.97); filter: blur(4px); }
          60%  { filter: blur(0); }
          100% { transform: translateY(0)    scale(1);    filter: blur(0); }
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
