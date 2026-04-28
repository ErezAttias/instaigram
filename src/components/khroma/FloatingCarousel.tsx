'use client'

import { isColorLight, withAlpha } from './utils'
import type { CarouselTheme } from './themes'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
const SERIF = "'Roboto Slab', Georgia, serif"

export function FloatingCarousel({ theme, nonce, isLight = false }: { theme: CarouselTheme; nonce: string | number; isLight?: boolean }) {
  const textIsDark = isLight ? true : isColorLight(theme.bg)
  // Chrome background meets the image area edge-to-edge. In dark mode we use
  // the theme's solid bg (no alpha) so the image-gradient bottom and chrome
  // top are the exact same pixel value — avoids a 1px seam where the two
  // composited layers disagree by a hair.
  const chromeBg = isLight ? '#ffffff' : (textIsDark ? 'rgba(255,255,255,0.88)' : theme.bg)
  const chromeFg = isLight ? '#111' : (textIsDark ? '#111' : '#fff')
  const chromeDot = isLight ? '#111' : (textIsDark ? '#111' : '#fff')
  const avatarBorder = isLight ? '#fff' : (textIsDark ? '#fff' : '#000')
  return (
    <div
      key={nonce}
      className="relative select-none carousel-float"
      style={{ width: 'min(380px, 80%)', aspectRatio: '9 / 14' }}
    >
      <div
        className="relative flex flex-col rounded-[22px] overflow-hidden w-full h-full carousel-morph"
        style={{
          background: theme.bg,
          // Drop shadow only — no 1px hairline ring, which otherwise reads as
          // a faint stripe against the aurora backdrop on the card's sides.
          boxShadow: isLight
            ? '0 30px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.10)'
            : '0 50px 100px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{ background: chromeBg, color: chromeFg }}
        >
          <div className="p-[2px] rounded-full shrink-0" style={{ background: IG_GRADIENT }}>
            <div
              className="w-7 h-7 rounded-full border-2"
              style={{ borderColor: avatarBorder, background: theme.accent }}
            />
          </div>
          <span className="text-[12px] font-semibold leading-none flex-1 min-w-0 truncate">@{theme.username}</span>
          <div className="flex gap-[3px] shrink-0 opacity-70">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: chromeDot }} />
            ))}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.imageUrl}
            alt=""
            className="absolute inset-0 object-cover carousel-image"
            style={{
              filter: 'saturate(1.15) contrast(1.05)',
              // Overshoot the container by 1px on every edge so the scaled
              // `image-in` animation (1.06 → 1.0) never parks a pixel exactly
              // on the clip boundary. Prevents a 1px hairline where the outer
              // card bg shows through during the micro-zoom load.
              top: -1,
              left: -1,
              width: 'calc(100% + 2px)',
              height: 'calc(100% + 2px)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, transparent 25%, ${withAlpha(theme.bg, 0.35)} 55%, ${withAlpha(theme.bg, 0.95)} 90%, ${theme.bg} 100%)`,
            }}
          />
          <div
            className="absolute bottom-0 inset-x-0 px-5 pb-10 pt-16 z-10 fc-text"
            // Font sizes live on CSS vars so a media query can scale them
            // down on mobile without overriding inline styles.
            style={{
              ['--h-size' as string]: `${theme.headlineSizePx ?? 28}px`,
              ['--cta-size' as string]: `${theme.ctaSizePx ?? 12}px`,
            }}
          >
            <h3
              className="whitespace-pre-line leading-[1.02] tracking-tight fc-headline"
              style={{
                color: theme.fg,
                fontFamily: theme.headlineFont ?? SERIF,
                fontWeight: theme.headlineWeight ?? 400,
                fontStyle: theme.italic ? 'italic' : 'normal',
              }}
            >
              {theme.headline}
            </h3>
            {theme.cta && (
              <p
                className="mt-2 tracking-wide fc-cta"
                style={{
                  color: theme.fg,
                  opacity: 0.75,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: 500,
                }}
              >
                {theme.cta}
              </p>
            )}
          </div>
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-20">
            {Array.from({ length: theme.slideCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: i === theme.activeIndex ? 18 : 6,
                  height: 6,
                  background: i === theme.activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>
        </div>

        <div
          className="px-3 pt-2 pb-3 shrink-0 relative"
          style={{
            background: chromeBg,
            color: chromeFg,
            // Overlap the image region by 1px so the chrome paints *over* any
            // sub-pixel seam left by the gradient's final row. Purely visual.
            marginTop: -1,
            paddingTop: 'calc(0.5rem + 1px)',
          }}
        >
          <div className="flex items-center gap-3 mb-1.5 opacity-85">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            <div className="flex-1" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <p className="text-[11px] opacity-75 truncate">{theme.subhead}</p>
        </div>
      </div>
    </div>
  )
}
