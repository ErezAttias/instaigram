'use client'

import { useEffect, useState } from 'react'
import { isColorLight, withAlpha } from './utils'
import type { CarouselTheme } from './themes'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const SERIF = "'Instrument Serif', 'Times New Roman', serif"

export type LiveSlide = {
  slideIndex: number
  role: string
  headline: string | null
  displayTitle: string | null
  displaySupport: string | null
  imageUrl?: string | null
  status?: string
}

type Props = {
  slides: LiveSlide[]
  theme: CarouselTheme
  /** Username to show in the header. Defaults to theme.username. */
  username?: string
  /**
   * When true, advance through slides automatically (for passive preview while
   * images render). When false, the caller controls `activeIndex`.
   */
  autoCycle?: boolean
  activeIndex?: number
  onActiveChange?: (index: number) => void
  /**
   * When provided, a "Re-roll image" button appears above the card. The
   * calling page is responsible for actually firing the API request and
   * swapping the slide's imageUrl once it lands.
   */
  onRegenerateSlide?: (slideIndex: number) => void
  /** Slide indices currently being regenerated (render as skeleton). */
  regeneratingSet?: Set<number>
}

export function LiveCarousel({
  slides,
  theme,
  username,
  autoCycle = true,
  activeIndex: controlledIndex,
  onActiveChange,
  onRegenerateSlide,
  regeneratingSet,
}: Props) {
  const [internalIndex, setInternalIndex] = useState(0)
  const activeIndex = controlledIndex ?? internalIndex
  const setActive = (i: number) => {
    if (onActiveChange) onActiveChange(i)
    else setInternalIndex(i)
  }

  useEffect(() => {
    if (!autoCycle) return
    if (slides.length === 0) return
    const t = setInterval(() => {
      setActive((activeIndex + 1) % slides.length)
    }, 3200)
    return () => clearInterval(t)
  }, [autoCycle, slides.length, activeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const textIsDark = isColorLight(theme.bg)
  const current = slides[activeIndex]
  const currentIsRegenerating = current ? !!regeneratingSet?.has(current.slideIndex) : false
  const currentImageUrl = currentIsRegenerating ? null : current?.imageUrl

  return (
    <div
      className="relative select-none carousel-float flex flex-col items-center gap-3"
      style={{ width: 'min(380px, 80%)' }}
    >
      <div
        className="relative flex flex-col rounded-[22px] overflow-hidden w-full"
        style={{
          aspectRatio: '9 / 14',
          background: theme.bg,
          boxShadow: '0 50px 100px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{
            background: textIsDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.4)',
            color: textIsDark ? '#111' : '#fff',
          }}
        >
          <div className="p-[2px] rounded-full shrink-0" style={{ background: IG_GRADIENT }}>
            <div
              className="w-7 h-7 rounded-full border-2"
              style={{ borderColor: textIsDark ? '#fff' : '#000', background: theme.accent }}
            />
          </div>
          <span className="text-[12px] font-semibold leading-none flex-1 min-w-0 truncate">
            @{username ?? theme.username}
          </span>
          <div className="flex gap-[3px] shrink-0 opacity-70">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: textIsDark ? '#111' : '#fff' }} />
            ))}
          </div>
        </div>

        {/* Photo / headline slot */}
        <div className="relative flex-1 overflow-hidden" style={{ background: theme.bg }}>
          {/* Animated fade-in for image once it lands */}
          {currentImageUrl ? (
            <img
              key={currentImageUrl}
              src={currentImageUrl}
              alt=""
              className="w-full h-full object-cover carousel-image"
              style={{ filter: 'saturate(1.15) contrast(1.05)' }}
            />
          ) : (
            <ImageSkeleton accent={theme.accent} />
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, transparent 25%, ${withAlpha(theme.bg, 0.35)} 55%, ${withAlpha(theme.bg, 0.95)} 95%)`,
            }}
          />
          <div className="absolute bottom-0 inset-x-0 px-5 pb-10 pt-16 z-10">
            <h3
              key={`h-${current?.slideIndex}`}
              className="whitespace-pre-line leading-[1.05] tracking-tight"
              style={{
                color: theme.fg,
                fontFamily: theme.headlineFont ?? SERIF,
                fontWeight: theme.headlineWeight ?? 400,
                fontStyle: theme.italic ? 'italic' : 'normal',
                fontSize: '28px',
              }}
            >
              {current?.displayTitle || current?.headline || '—'}
            </h3>
            {current?.displaySupport && (
              <p
                className="mt-2 opacity-80 text-[13px] leading-snug"
                style={{ color: theme.fg, fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                {current.displaySupport}
              </p>
            )}
          </div>

          {/* Slide dots — clickable */}
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-20">
            {slides.map((s, i) => (
              <button
                key={s.slideIndex}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show slide ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === activeIndex ? 18 : 6,
                  height: 6,
                  background: i === activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  pointerEvents: 'auto',
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-3 pt-2 pb-3 shrink-0"
          style={{
            background: textIsDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.4)',
            color: textIsDark ? '#111' : '#fff',
          }}
        >
          <div className="flex items-center gap-3 mb-1.5 opacity-85">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            <div className="flex-1" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <p className="text-[11px] opacity-75 truncate">
            {current?.role ? `${current.role.toLowerCase()} · ${activeIndex + 1} / ${slides.length}` : ''}
          </p>
        </div>
      </div>

      {/* Re-roll image — only while interactive */}
      {onRegenerateSlide && current && (
        <button
          type="button"
          onClick={() => onRegenerateSlide(current.slideIndex)}
          disabled={currentIsRegenerating}
          aria-label="Re-roll this slide's image"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed pointer-events-auto"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: "'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(8px)',
          }}
        >
          {currentIsRegenerating ? (
            <>
              <span className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
              Re-rolling image…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Re-roll this image
            </>
          )}
        </button>
      )}
    </div>
  )
}

function ImageSkeleton({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${withAlpha(accent, 0.4)}, transparent 60%),
                       radial-gradient(circle at 70% 70%, ${withAlpha(accent, 0.3)}, transparent 60%)`,
        }}
      />
      <div
        className="absolute inset-y-0 -left-full w-[300%] skeleton-shimmer"
        style={{
          background: `linear-gradient(90deg, transparent, ${withAlpha(accent, 0.2)}, transparent)`,
        }}
      />
      <style jsx>{`
        .skeleton-shimmer {
          animation: shimmer 2.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { transform: translateX(0); }
          100% { transform: translateX(66%); }
        }
      `}</style>
    </div>
  )
}
