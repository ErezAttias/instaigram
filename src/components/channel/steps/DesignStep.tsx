'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { TITLE_FONTS, type FontOption } from '@/lib/visual/font-pairings-data'

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

// Flat palette of single colors — each applies to whichever target is active
const COLOR_SWATCHES: { id: string; label: string; hex: string }[] = [
  { id: 'white', label: 'White', hex: '#FFFFFF' },
  { id: 'soft', label: 'Soft Gray', hex: '#D0D0D0' },
  { id: 'gold', label: 'Warm Gold', hex: '#FFD700' },
  { id: 'blue', label: 'Cool Blue', hex: '#7DD3FC' },
  { id: 'green', label: 'Neon Green', hex: '#4ADE80' },
  { id: 'fire', label: 'Fire', hex: '#FB923C' },
  { id: 'pink', label: 'Pink', hex: '#F472B6' },
]

const WEIGHTS = [
  { id: 300, label: 'Light' },
  { id: 400, label: 'Regular' },
  { id: 500, label: 'Medium' },
  { id: 600, label: 'SemiBold' },
  { id: 700, label: 'Bold' },
  { id: 800, label: 'ExtraBold' },
]

type Align = 'left' | 'center' | 'right'
type Target = 'title' | 'body'

// Real canvas is 1080px wide — scale preview sizes by (actualCardWidth / 1080)

// Size ranges per target
const TITLE_RANGE = { min: 40, max: 100, step: 4, default: 72 }
const BODY_RANGE = { min: 20, max: 56, step: 2, default: 40 }

interface DesignStepProps {
  sampleTitle: string
  sampleSubtitle: string
  channelId?: string
  onApprove: (style: { titleFontId: string; headlineColor: string; bodyColor: string }) => void
  onBack: () => void
}

export function DesignStep({ sampleTitle, sampleSubtitle, channelId, onApprove, onBack }: DesignStepProps) {
  // Active target the control panel is editing
  const [target, setTarget] = useState<Target>('title')

  // Per-target state — every control below is bound to the active target
  const [titleFontId, setTitleFontId] = useState<string>('inter')
  const [titleSizePx, setTitleSizePx] = useState<number>(TITLE_RANGE.default)
  const [titleAlign, setTitleAlign] = useState<Align>('left')
  const [titleWeight, setTitleWeight] = useState<number>(800)
  const [titleColor, setTitleColor] = useState<string>('#FFFFFF')

  const [bodyFontId, setBodyFontId] = useState<string>('inter')
  const [bodySizePx, setBodySizePx] = useState<number>(BODY_RANGE.default)
  const [bodyAlign, setBodyAlign] = useState<Align>('left')
  const [bodyWeight, setBodyWeight] = useState<number>(400)
  const [bodyColor, setBodyColor] = useState<string>('#D0D0D0')

  const [saving, setSaving] = useState(false)

  // Mobile-only collapsible state (desktop always shows all sections)
  const [openSections, setOpenSections] = useState<Record<'font' | 'sizeAlign' | 'weight' | 'color', boolean>>({
    font: false,
    sizeAlign: false,
    weight: false,
    color: false,
  })
  const toggleSection = (key: 'font' | 'sizeAlign' | 'weight' | 'color') =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }))

  // Track preview card width for responsive font scaling
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = useState(360)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setCardWidth(entry.contentRect.width)
    })
    ro.observe(el)
    setCardWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  const previewScale = cardWidth / 1080

  // Resolved values for the ACTIVE target — what the control panel reads/writes
  const active = useMemo(() => {
    if (target === 'title') {
      return {
        fontId: titleFontId,
        setFontId: setTitleFontId,
        sizePx: titleSizePx,
        setSizePx: setTitleSizePx,
        align: titleAlign,
        setAlign: setTitleAlign,
        weight: titleWeight,
        setWeight: setTitleWeight,
        color: titleColor,
        setColor: setTitleColor,
        range: TITLE_RANGE,
      }
    }
    return {
      fontId: bodyFontId,
      setFontId: setBodyFontId,
      sizePx: bodySizePx,
      setSizePx: setBodySizePx,
      align: bodyAlign,
      setAlign: setBodyAlign,
      weight: bodyWeight,
      setWeight: setBodyWeight,
      color: bodyColor,
      setColor: setBodyColor,
      range: BODY_RANGE,
    }
  }, [
    target,
    titleFontId, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontId, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  const titleFont = TITLE_FONTS.find(f => f.id === titleFontId) ?? TITLE_FONTS[0]
  const bodyFont = TITLE_FONTS.find(f => f.id === bodyFontId) ?? TITLE_FONTS[0]

  // Load Google Fonts for preview — full weight range for fonts that support it
  useEffect(() => {
    // Load each title font with all the weights the picker can request.
    // Fonts that don't offer a weight variant fall back to the nearest available.
    const families = [
      'Inter:wght@300;400;500;600;700;800',
      'Bebas+Neue',
      'Oswald:wght@300;400;500;600;700',
      'Montserrat:wght@300;400;500;600;700;800;900',
      'Anton',
    ].join('&family=')
    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const decSize = () => active.setSizePx(Math.max(active.range.min, active.sizePx - active.range.step))
  const incSize = () => active.setSizePx(Math.min(active.range.max, active.sizePx + active.range.step))

  const handleApprove = async () => {
    setSaving(true)
    if (channelId) {
      try {
        await fetch(`/api/admin/channels/${channelId}/visual-style`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titleFontId,
            bodyFontId,
            headlineColor: titleColor,
            bodyColor,
            t1FontSizePx: titleSizePx,
            t2FontSizePx: bodySizePx,
            titleWeight,
            bodyWeight,
            titleAlign,
            bodyAlign,
          }),
        })
      } catch {
        // non-blocking
      }
    }
    onApprove({
      titleFontId,
      headlineColor: titleColor,
      bodyColor,
    })
    setSaving(false)
  }

  const previewTitlePx = titleSizePx * previewScale
  const previewBodyPx = bodySizePx * previewScale

  return (
    <div className="animate-fade-up bg-surface rounded-2xl border border-border py-10 px-3 sm:px-6 lg:py-12 lg:px-10">
      <div className="max-w-3xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 text-center bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
          Step 4 of 5
        </p>
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-center">Design your slides</h2>
        <p className="text-sm text-muted-light mb-8 text-center">Pick a target, then style its font, size, alignment, weight, and color.</p>

        {/* Live preview */}
        <div className="flex justify-center mb-8">
          <div
            ref={cardRef}
            className="w-full max-w-[360px] rounded-xl overflow-hidden relative flex items-end shadow-2xl"
            style={{
              aspectRatio: '1080 / 1350',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.40) 65%, rgba(0,0,0,0.82) 75%, rgba(0,0,0,0.96) 100%)',
              }}
            />
            <div className="relative z-10 w-full" style={{ paddingLeft: '6.1%', paddingRight: '6.1%', paddingBottom: '7.8%' }}>
              <p
                onClick={() => setTarget('title')}
                className={`leading-[1.15] mb-1.5 cursor-pointer rounded-md transition-shadow ${target === 'title' ? 'ring-1 ring-[#dc2743]/60 ring-offset-1 ring-offset-black/40' : ''}`}
                style={{
                  fontFamily: `'${titleFont.family}', sans-serif`,
                  fontWeight: titleWeight,
                  fontSize: `${previewTitlePx}px`,
                  color: titleColor,
                  letterSpacing: '-0.5px',
                  textAlign: titleAlign,
                }}
              >
                {sampleTitle}
              </p>
              <p
                onClick={() => setTarget('body')}
                className={`leading-relaxed cursor-pointer rounded-md transition-shadow ${target === 'body' ? 'ring-1 ring-[#dc2743]/60 ring-offset-1 ring-offset-black/40' : ''}`}
                style={{
                  fontFamily: `'${bodyFont.family}', sans-serif`,
                  fontWeight: bodyWeight,
                  fontSize: `${previewBodyPx}px`,
                  color: bodyColor,
                  opacity: 0.95,
                  textAlign: bodyAlign,
                }}
              >
                {sampleSubtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Controls stack */}
        <div className="space-y-6">
          {/* 1 — Target selector (Title / Body) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">Editing</label>
            <div className="inline-flex rounded-xl border-2 border-border p-1">
              {(['title', 'body'] as const).map(t => {
                const isActive = target === t
                const swatch = t === 'title' ? titleColor : bodyColor
                return (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    className={`px-4 h-9 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-[#dc2743]/10 text-[#dc2743]'
                        : 'text-muted-light hover:text-foreground'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-white/20"
                      style={{ background: swatch }}
                    />
                    {t === 'title' ? 'Title' : 'Body'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2 — Font picker */}
          <div>
            <SectionHeader
              label={target === 'title' ? 'Title Font' : 'Body Font'}
              isOpen={openSections.font}
              onToggle={() => toggleSection('font')}
            />
            <div className={`${openSections.font ? '' : 'max-sm:hidden'} flex flex-wrap gap-2`}>
              {TITLE_FONTS.map((f: FontOption) => (
                <button
                  key={f.id}
                  onClick={() => active.setFontId(f.id)}
                  className={`px-4 py-2.5 rounded-xl border-2 transition-all ${
                    active.fontId === f.id
                      ? 'border-[#dc2743] bg-[#dc2743]/5'
                      : 'border-border hover:border-[#dc2743]/30'
                  }`}
                >
                  <span
                    className="text-base text-foreground"
                    style={{ fontFamily: `'${f.family}', sans-serif`, fontWeight: f.weight }}
                  >
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 3 — Size stepper + Align, side-by-side (one collapsible group on mobile) */}
          <div>
            <SectionHeader
              label="Size & Align"
              isOpen={openSections.sizeAlign}
              onToggle={() => toggleSection('sizeAlign')}
            />
            <div className={`${openSections.sizeAlign ? '' : 'max-sm:hidden'} flex flex-wrap gap-8`}>
            {/* Size */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">
                {target === 'title' ? 'Title Size' : 'Body Size'}
              </label>
              <div className="inline-flex items-center gap-2 rounded-xl border-2 border-border p-1">
                <button
                  type="button"
                  onClick={decSize}
                  disabled={active.sizePx <= active.range.min}
                  aria-label="Decrease size"
                  className="w-9 h-9 rounded-lg text-lg font-semibold text-foreground hover:bg-[#dc2743]/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  −
                </button>
                <div className="min-w-[64px] text-center tabular-nums text-sm font-semibold text-foreground">
                  {active.sizePx}px
                </div>
                <button
                  type="button"
                  onClick={incSize}
                  disabled={active.sizePx >= active.range.max}
                  aria-label="Increase size"
                  className="w-9 h-9 rounded-lg text-lg font-semibold text-foreground hover:bg-[#dc2743]/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Align */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-light mb-3 block">Layout Align</label>
              <div className="inline-flex rounded-xl border-2 border-border p-1">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => active.setAlign(a)}
                    aria-label={`Align ${a}`}
                    className={`w-10 h-9 rounded-lg flex items-center justify-center transition-all ${
                      active.align === a
                        ? 'bg-[#dc2743]/10 text-[#dc2743]'
                        : 'text-muted-light hover:text-foreground'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {a === 'left' && (
                        <>
                          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="1" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="1" y1="15" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </>
                      )}
                      {a === 'center' && (
                        <>
                          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="3" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="2" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="4" y1="15" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </>
                      )}
                      {a === 'right' && (
                        <>
                          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="6" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="3" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="8" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </>
                      )}
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>

          {/* 4 — Weight picker */}
          <div>
            <SectionHeader
              label={target === 'title' ? 'Title Weight' : 'Body Weight'}
              isOpen={openSections.weight}
              onToggle={() => toggleSection('weight')}
            />
            <div className={`${openSections.weight ? '' : 'max-sm:hidden'} flex flex-wrap gap-2`}>
              {WEIGHTS.map(w => {
                const fontFamilyForPill = target === 'title' ? titleFont.family : bodyFont.family
                return (
                  <button
                    key={w.id}
                    onClick={() => active.setWeight(w.id)}
                    className={`px-4 py-2.5 rounded-xl border-2 transition-all ${
                      active.weight === w.id
                        ? 'border-[#dc2743] bg-[#dc2743]/5'
                        : 'border-border hover:border-[#dc2743]/30'
                    }`}
                  >
                    <span
                      className="text-sm text-foreground"
                      style={{ fontFamily: `'${fontFamilyForPill}', sans-serif`, fontWeight: w.id }}
                    >
                      {w.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 5 — Color scheme */}
          <div>
            <SectionHeader
              label="Color Scheme"
              isOpen={openSections.color}
              onToggle={() => toggleSection('color')}
            />
            <div className={`${openSections.color ? '' : 'max-sm:hidden'} flex flex-wrap gap-2`}>
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c.id}
                  onClick={() => active.setColor(c.hex)}
                  className={`px-3 py-2 rounded-xl border-2 transition-all ${
                    active.color.toUpperCase() === c.hex.toUpperCase()
                      ? 'border-[#dc2743] bg-[#dc2743]/5'
                      : 'border-border hover:border-[#dc2743]/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: c.hex }} />
                    <span className="text-xs font-medium text-foreground">{c.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 mt-8">
          <button onClick={onBack} className="text-sm text-muted-light hover:text-foreground transition-colors self-center sm:self-auto order-2 sm:order-1">
            &larr; Back
          </button>
          <button
            onClick={handleApprove}
            disabled={saving}
            className="w-full sm:w-auto min-h-11 py-2.5 px-8 text-white rounded-full text-sm font-semibold disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98] order-1 sm:order-2"
            style={{ background: IG_GRADIENT }}
          >
            {saving ? 'Saving...' : 'Approve design'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Header for a collapsible control group.
 * - Mobile (<sm): tappable row with chevron that toggles the section.
 * - Desktop (≥sm): inert label; clicks do nothing and the chevron is hidden.
 */
function SectionHeader({ label, isOpen, onToggle }: { label: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex items-center justify-between w-full mb-3 sm:pointer-events-none sm:cursor-default text-left"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-light">{label}</span>
      <svg
        className={`sm:hidden w-4 h-4 text-muted-light transition-transform ${isOpen ? 'rotate-180' : ''}`}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
