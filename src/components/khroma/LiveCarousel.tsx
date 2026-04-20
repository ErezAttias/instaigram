'use client'

import { useEffect, useRef, useState } from 'react'
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
   * Direction of the most recent slide change. 'next' slides the new card
   * in from the right, 'prev' from the left. Ignored if omitted.
   */
  slideDirection?: 'next' | 'prev'
  /**
   * When provided, a "Re-roll image" button appears above the card. The
   * calling page is responsible for actually firing the API request and
   * swapping the slide's imageUrl once it lands.
   */
  onRegenerateSlide?: (slideIndex: number) => void
  /** Slide indices currently being regenerated (render as skeleton). */
  regeneratingSet?: Set<number>
  /**
   * When provided, hovering the image / headline / supporting-text reveals
   * a floating "Edit" button. Clicking it calls this with the element id
   * so the parent can swap its design panel to the relevant tool.
   */
  onEditElement?: (which: 'image' | 'headline' | 'support') => void
}

export function LiveCarousel({
  slides,
  theme,
  username,
  autoCycle = true,
  activeIndex: controlledIndex,
  onActiveChange,
  slideDirection = 'next',
  onRegenerateSlide,
  regeneratingSet,
  onEditElement,
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

        {/* Photo / headline slot — matches the exported 4:5 (1080×1350) slide dimensions. */}
        <div className="relative overflow-hidden w-full" style={{ background: theme.bg, aspectRatio: '4 / 5' }}>
          <div
            key={`slide-${current?.slideIndex}`}
            className={`absolute inset-0 ${slideDirection === 'prev' ? 'slide-swap-prev' : 'slide-swap-next'}`}
          >
            {/* Image layer with hover-edit */}
            <div className="absolute inset-0 group/image">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: 'saturate(1.15) contrast(1.05)' }}
                />
              ) : (
                <ImageSkeleton accent={theme.accent} />
              )}
              {onEditElement && (
                <EditChip
                  label="Edit image"
                  className="absolute top-3 right-3 edit-chip edit-chip-from-top group-hover/image:edit-chip-in"
                  onClick={() => onEditElement('image')}
                />
              )}
            </div>
            {/* Text-scrim gradient — blends image into the text area.
                spread 0 = harsh (starts at 65%), spread 100 = soft (starts at 0%).
                Default spread 50 → starts at ~20%. */}
            {(() => {
              const spread     = theme.textBgSpread ?? 50            // 0–100
              const height     = theme.textBgHeight ?? 50            // 0–100
              const solidPct   = Math.round(98 - height * 0.38)     // 98% (short) → 60% (tall)
              const startPct   = Math.min(Math.round(65 - spread * 0.65), solidPct - 10) // can't exceed solidPct
              const midPct     = Math.round(startPct + (solidPct - startPct) * 0.55)
              const scrimColor = theme.textBgColor ?? theme.bg
              return (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to bottom, transparent ${startPct}%, ${withAlpha(scrimColor, 0.4)} ${midPct}%, ${withAlpha(scrimColor, 0.97)} ${solidPct}%)`,
                  }}
                />
              )
            })()}

            {/* Bottom zone: text + hoverable scrim-color chip */}
            <div className="absolute bottom-0 inset-x-0 z-10">
              {/* Scrim color edit — hover the gradient area to reveal chip */}
              <TrackingEditZone
                label="Change gradient color"
                enabled={!!onEditElement}
                onClick={() => onEditElement?.('textbg')}
                chipOffset={{ x: 0, y: -8 }}
                className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-auto"
              />

              {/* Headline + support text */}
              <div className="px-5 pb-10 pt-16">
                <TrackingEditZone
                  label="Edit headline"
                  enabled={!!onEditElement}
                  onClick={() => onEditElement?.('headline')}
                >
                  <h3
                    className="whitespace-pre-line leading-[1.05] tracking-tight"
                    style={{
                      color: theme.fg,
                      fontFamily: theme.headlineFont ?? SERIF,
                      fontWeight: theme.headlineWeight ?? 400,
                      fontStyle: theme.italic ? 'italic' : 'normal',
                      fontSize: theme.headlineSizePx ? `${theme.headlineSizePx}px` : '28px',
                    }}
                  >
                    {current?.displayTitle || current?.headline || '—'}
                  </h3>
                </TrackingEditZone>
                {current?.displaySupport && (
                  <TrackingEditZone
                    label={current.role === 'OPENER' || current.role === 'CTA' ? 'Edit Call to Action' : 'Edit paragraph'}
                    enabled={!!onEditElement}
                    onClick={() => onEditElement?.('support')}
                    className="mt-2"
                  >
                    <p
                      className="opacity-80 leading-snug"
                      style={{
                        color: theme.supportColor ?? theme.fg,
                        fontFamily: theme.supportFont ?? "'Inter', system-ui, sans-serif",
                        fontWeight: theme.supportWeight ?? 400,
                        fontStyle: theme.supportItalic ? 'italic' : 'normal',
                        fontSize: theme.supportSizePx ? `${theme.supportSizePx}px` : '13px',
                      }}
                    >
                      {current.displaySupport}
                    </p>
                  </TrackingEditZone>
                )}
              </div>
            </div>
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
          className="px-3 py-3 shrink-0 flex items-center gap-3 opacity-85"
          style={{
            background: textIsDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.4)',
            color: textIsDark ? '#111' : '#fff',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          <div className="flex-1" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        </div>
      </div>

      {/* In-progress indicator for image re-roll (non-interactive; the
          action itself lives in the left-column image panel). */}
      {currentIsRegenerating && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium pointer-events-none"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: "'Inter', system-ui, sans-serif",
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
          Re-rolling image…
        </div>
      )}
    </div>
  )
}

// ─── Cursor-tracking edit zone ───────────────────────────────────

function TrackingEditZone({
  label,
  enabled,
  onClick,
  children,
  className = '',
  chipOffset,
}: {
  label: string
  enabled: boolean
  onClick: () => void
  children?: React.ReactNode
  className?: string
  /** Nudge the chip relative to the cursor. Default: {x:12, y:0} */
  chipOffset?: { x: number; y: number }
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ox = chipOffset?.x ?? 12
  const oy = chipOffset?.y ?? 0

  if (!enabled) return <div className={className}>{children}</div>

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPos(null) }}
      onMouseMove={e => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect) return
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
    >
      {children}
      {hovered && pos && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: pos.x + ox, top: pos.y + oy, transform: 'translate(0, -50%)' }}
        >
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
            style={{
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.95)',
              fontFamily: "'Inter', system-ui, sans-serif",
              backdropFilter: 'blur(8px)',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            {label}
          </div>
        </div>
      )}
    </div>
  )
}

function EditChip({
  label,
  onClick,
  className,
}: {
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium hover:brightness-110 pointer-events-auto z-30 ${className ?? ''}`}
      style={{
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: 'rgba(255,255,255,0.95)',
        fontFamily: "'Inter', system-ui, sans-serif",
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
      {label}
    </button>
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
