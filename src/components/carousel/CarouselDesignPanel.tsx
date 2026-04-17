'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { TITLE_FONTS, type FontOption } from '@/lib/visual/font-pairings-data'
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style'

export type LiveDesign = {
  titleFontFamily: string
  titleFontWeightDefault: number
  titleSizePx: number
  titleAlign: 'left' | 'center' | 'right'
  titleWeight: number
  titleColor: string
  bodyFontFamily: string
  bodyFontWeightDefault: number
  bodySizePx: number
  bodyAlign: 'left' | 'center' | 'right'
  bodyWeight: number
  bodyColor: string
}

/**
 * Inline typography toolbar shown under the slide preview.
 *
 * Five labeled segments (Font / Size / Align / Weight / Color) each expand
 * their own drawer with the matching control. Title and Body are edited
 * independently via the target tabs at the top. Auto-saves channel visual
 * style and kicks `POST /restyle-all` with a 400 ms debounce, AbortController
 * cancellation, and a monotonic `designVersion` to drop stale responses.
 */

const IG_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'

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
type ToolId = 'font' | 'size' | 'align' | 'weight' | 'color'

const TITLE_RANGE = { min: 40, max: 100, step: 4 }
const BODY_RANGE = { min: 20, max: 56, step: 2 }

const DEFAULTS = {
  titleFontId: 'inter',
  titleSizePx: 72,
  titleAlign: 'left' as Align,
  titleWeight: 800,
  titleColor: '#FFFFFF',
  bodyFontId: 'inter',
  bodySizePx: 40,
  bodyAlign: 'left' as Align,
  bodyWeight: 400,
  bodyColor: '#D0D0D0',
}

interface CarouselDesignPanelProps {
  channelId: string | null
  jobId: string
  /** Slide count for the "Applied to all N slides" scope chip. */
  slideCount: number
  /** Called after a save+restyle succeeds so the viewer can refresh. */
  onRestyleStarted?: () => void
  /**
   * Emitted on every state change (including load). Lets the viewer render
   * a live CSS/SVG preview on top of the raw image so the user sees changes
   * instantly — instead of waiting for the server restyle to round-trip.
   */
  onLiveDesign?: (design: LiveDesign) => void
}

type SaveState = 'idle' | 'saving' | 'error'

export function CarouselDesignPanel({ channelId, jobId, slideCount, onRestyleStarted, onLiveDesign }: CarouselDesignPanelProps) {
  const [loaded, setLoaded] = useState(false)
  const [target, setTarget] = useState<Target>('title')
  const [openTool, setOpenTool] = useState<ToolId | null>('font')
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const [titleFontId, setTitleFontId] = useState<string>(DEFAULTS.titleFontId)
  const [titleSizePx, setTitleSizePx] = useState<number>(DEFAULTS.titleSizePx)
  const [titleAlign, setTitleAlign] = useState<Align>(DEFAULTS.titleAlign)
  const [titleWeight, setTitleWeight] = useState<number>(DEFAULTS.titleWeight)
  const [titleColor, setTitleColor] = useState<string>(DEFAULTS.titleColor)

  const [bodyFontId, setBodyFontId] = useState<string>(DEFAULTS.bodyFontId)
  const [bodySizePx, setBodySizePx] = useState<number>(DEFAULTS.bodySizePx)
  const [bodyAlign, setBodyAlign] = useState<Align>(DEFAULTS.bodyAlign)
  const [bodyWeight, setBodyWeight] = useState<number>(DEFAULTS.bodyWeight)
  const [bodyColor, setBodyColor] = useState<string>(DEFAULTS.bodyColor)

  useEffect(() => {
    if (!channelId) { setLoaded(true); return }
    fetch(`/api/admin/channels/${channelId}/visual-style`)
      .then(res => res.ok ? res.json() : null)
      .then((data: ChannelVisualStyleContext | null) => {
        if (!data) return
        if (data.titleFontId) setTitleFontId(data.titleFontId)
        if (data.bodyFontId) setBodyFontId(data.bodyFontId)
        if (data.t1FontSizePx) setTitleSizePx(data.t1FontSizePx)
        if (data.t2FontSizePx) setBodySizePx(data.t2FontSizePx)
        if (data.headlineColor) setTitleColor(data.headlineColor)
        if (data.bodyColor) setBodyColor(data.bodyColor)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [channelId])

  useEffect(() => {
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

  const active = useMemo(() => {
    if (target === 'title') {
      return {
        fontId: titleFontId, setFontId: setTitleFontId,
        sizePx: titleSizePx, setSizePx: setTitleSizePx,
        align: titleAlign, setAlign: setTitleAlign,
        weight: titleWeight, setWeight: setTitleWeight,
        color: titleColor, setColor: setTitleColor,
        range: TITLE_RANGE,
      }
    }
    return {
      fontId: bodyFontId, setFontId: setBodyFontId,
      sizePx: bodySizePx, setSizePx: setBodySizePx,
      align: bodyAlign, setAlign: setBodyAlign,
      weight: bodyWeight, setWeight: setBodyWeight,
      color: bodyColor, setColor: setBodyColor,
      range: BODY_RANGE,
    }
  }, [
    target,
    titleFontId, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontId, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  const activeFont = TITLE_FONTS.find(f => f.id === active.fontId) ?? TITLE_FONTS[0]
  const activeColorLabel = COLOR_SWATCHES.find(c => c.hex.toUpperCase() === active.color.toUpperCase())?.label ?? 'Custom'
  const activeAlignLabel = active.align === 'left' ? 'Left' : active.align === 'right' ? 'Right' : 'Center'
  const activeWeightLabel = WEIGHTS.find(w => w.id === active.weight)?.label ?? String(active.weight)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflightRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const skipFirstSaveRef = useRef(true)
  const onRestyleStartedRef = useRef(onRestyleStarted)
  useEffect(() => { onRestyleStartedRef.current = onRestyleStarted }, [onRestyleStarted])

  const queueSave = useCallback(() => {
    if (!channelId || !loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      inflightRef.current?.abort()
      const ctrl = new AbortController()
      inflightRef.current = ctrl
      const myVersion = ++versionRef.current

      setSaveState('saving')
      try {
        const styleRes = await fetch(`/api/admin/channels/${channelId}/visual-style`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titleFontId, bodyFontId,
            headlineColor: titleColor, bodyColor,
            t1FontSizePx: titleSizePx, t2FontSizePx: bodySizePx,
          }),
          signal: ctrl.signal,
        })
        if (!styleRes.ok) throw new Error(`style save failed (${styleRes.status})`)
        if (myVersion !== versionRef.current) return

        const restyleRes = await fetch(`/api/carousel/${jobId}/restyle-all`, {
          method: 'POST', signal: ctrl.signal,
        })
        if (!restyleRes.ok) throw new Error(`restyle failed (${restyleRes.status})`)
        if (myVersion !== versionRef.current) return

        setSaveState('idle')
        onRestyleStartedRef.current?.()
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (myVersion !== versionRef.current) return
        setSaveState('error')
      }
    }, 400)
  }, [
    channelId, jobId, loaded,
    titleFontId, bodyFontId, titleColor, bodyColor,
    titleSizePx, bodySizePx,
  ])

  useEffect(() => {
    if (!loaded) return
    if (skipFirstSaveRef.current) { skipFirstSaveRef.current = false; return }
    queueSave()
  }, [
    queueSave, loaded,
    titleFontId, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontId, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    inflightRef.current?.abort()
  }, [])

  // Publish the live design snapshot whenever anything visual changes so the
  // viewer can render an instant CSS overlay on the raw image.
  const titleFont = TITLE_FONTS.find(f => f.id === titleFontId) ?? TITLE_FONTS[0]
  const bodyFontMeta = TITLE_FONTS.find(f => f.id === bodyFontId) ?? TITLE_FONTS[0]
  const onLiveDesignRef = useRef(onLiveDesign)
  useEffect(() => { onLiveDesignRef.current = onLiveDesign }, [onLiveDesign])
  useEffect(() => {
    if (!loaded) return
    onLiveDesignRef.current?.({
      titleFontFamily: titleFont.family,
      titleFontWeightDefault: titleFont.weight,
      titleSizePx, titleAlign, titleWeight, titleColor,
      bodyFontFamily: bodyFontMeta.family,
      bodyFontWeightDefault: bodyFontMeta.weight,
      bodySizePx, bodyAlign, bodyWeight, bodyColor,
    })
  }, [
    loaded,
    titleFont, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontMeta, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  const clampSize = (n: number) => Math.min(active.range.max, Math.max(active.range.min, n))
  const toggle = (id: ToolId) => setOpenTool(prev => (prev === id ? null : id))

  const handleReset = () => {
    setTitleFontId(DEFAULTS.titleFontId); setTitleSizePx(DEFAULTS.titleSizePx)
    setTitleAlign(DEFAULTS.titleAlign); setTitleWeight(DEFAULTS.titleWeight); setTitleColor(DEFAULTS.titleColor)
    setBodyFontId(DEFAULTS.bodyFontId); setBodySizePx(DEFAULTS.bodySizePx)
    setBodyAlign(DEFAULTS.bodyAlign); setBodyWeight(DEFAULTS.bodyWeight); setBodyColor(DEFAULTS.bodyColor)
  }

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Target tabs + scope chip + save state — all centered */}
      <div className="flex flex-col items-center gap-2 px-3 pt-3">
        <div className="inline-flex rounded-xl border-2 border-border p-1">
          {(['title', 'body'] as const).map(t => {
            const isActive = target === t
            const swatch = t === 'title' ? titleColor : bodyColor
            return (
              <button
                key={t}
                onClick={() => setTarget(t)}
                aria-pressed={isActive}
                className={`px-3 h-8 rounded-lg flex items-center gap-1.5 text-[12px] font-semibold transition-all ${
                  isActive ? 'bg-[#dc2743] text-white shadow-sm' : 'text-muted-light hover:text-foreground'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ background: swatch }} />
                {t === 'title' ? 'Title' : 'Body'}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {saveState === 'saving' && (
            <span className="text-[10px] text-muted-light flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              Saving
            </span>
          )}
          {saveState === 'error' && (
            <span className="text-[10px] text-danger flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              Save failed
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-light">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Applied to all {slideCount} slides
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-semibold text-muted-light hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* 5 segmented tools — centered row */}
      <div className="flex justify-center gap-1.5 p-3">
        <ToolSegment
          icon={<FontIcon />}
          label="Font"
          value={activeFont.label}
          valueStyle={{ fontFamily: `'${activeFont.family}', sans-serif` }}
          active={openTool === 'font'}
          onClick={() => toggle('font')}
        />
        <ToolSegment
          icon={<SizeIcon />}
          label="Size"
          value={`${active.sizePx}px`}
          active={openTool === 'size'}
          onClick={() => toggle('size')}
        />
        <ToolSegment
          icon={<AlignIcon align={active.align} />}
          label="Align"
          value={activeAlignLabel}
          active={openTool === 'align'}
          onClick={() => toggle('align')}
        />
        <ToolSegment
          icon={<WeightIcon />}
          label="Weight"
          value={activeWeightLabel}
          active={openTool === 'weight'}
          onClick={() => toggle('weight')}
        />
        <ToolSegment
          icon={<ColorIcon color={active.color} />}
          label="Color"
          value={activeColorLabel}
          active={openTool === 'color'}
          onClick={() => toggle('color')}
        />
      </div>

      {/* Drawer — contents centered */}
      {openTool && (
        <div className="border-t border-border/60 px-4 py-4 bg-surface flex flex-col items-center">
          {openTool === 'font' && (
            <div className="flex flex-wrap justify-center gap-2">
              {TITLE_FONTS.map((f: FontOption) => (
                <button
                  key={f.id}
                  onClick={() => active.setFontId(f.id)}
                  className={`px-3 py-2 rounded-xl border-2 transition-all ${
                    active.fontId === f.id ? 'border-[#dc2743] bg-[#dc2743]/5' : 'border-border hover:border-[#dc2743]/30'
                  }`}
                >
                  <span className="text-sm text-foreground" style={{ fontFamily: `'${f.family}', sans-serif`, fontWeight: f.weight }}>
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {openTool === 'size' && (
            <div className="inline-flex items-center gap-2 rounded-xl border-2 border-border p-1">
              <button
                type="button"
                onClick={() => active.setSizePx(clampSize(active.sizePx - active.range.step))}
                disabled={active.sizePx <= active.range.min}
                aria-label="Decrease size"
                className="w-9 h-9 rounded-lg text-lg font-semibold text-foreground hover:bg-[#dc2743]/10 disabled:opacity-30 transition-colors"
              >−</button>
              <div className="flex items-center">
                <input
                  type="number"
                  min={active.range.min} max={active.range.max} step={active.range.step}
                  value={active.sizePx}
                  onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) active.setSizePx(clampSize(n)) }}
                  aria-label={target === 'title' ? 'Title size in pixels' : 'Body size in pixels'}
                  className="w-14 text-center bg-transparent tabular-nums text-sm font-semibold text-foreground outline-none focus:ring-1 focus:ring-[#dc2743]/40 rounded-md"
                />
                <span className="text-xs text-muted-light">px</span>
              </div>
              <button
                type="button"
                onClick={() => active.setSizePx(clampSize(active.sizePx + active.range.step))}
                disabled={active.sizePx >= active.range.max}
                aria-label="Increase size"
                className="w-9 h-9 rounded-lg text-lg font-semibold text-foreground hover:bg-[#dc2743]/10 disabled:opacity-30 transition-colors"
              >+</button>
            </div>
          )}

          {openTool === 'align' && (
            <div className="inline-flex rounded-xl border-2 border-border p-1">
              {(['left', 'center', 'right'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => active.setAlign(a)}
                  aria-label={`Align ${a}`}
                  aria-pressed={active.align === a}
                  className={`w-10 h-9 rounded-lg flex items-center justify-center transition-all ${
                    active.align === a ? 'bg-[#dc2743] text-white' : 'text-muted-light hover:text-foreground'
                  }`}
                >
                  <AlignIcon align={a} />
                </button>
              ))}
            </div>
          )}

          {openTool === 'weight' && (
            <div className="flex flex-wrap justify-center gap-2">
              {WEIGHTS.map(w => (
                <button
                  key={w.id}
                  onClick={() => active.setWeight(w.id)}
                  className={`px-3.5 py-2 rounded-xl border-2 transition-all ${
                    active.weight === w.id ? 'border-[#dc2743] bg-[#dc2743]/5' : 'border-border hover:border-[#dc2743]/30'
                  }`}
                >
                  <span className="text-xs text-foreground" style={{ fontFamily: `'${activeFont.family}', sans-serif`, fontWeight: w.id }}>
                    {w.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {openTool === 'color' && (
            <div className="flex flex-wrap justify-center gap-2">
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
          )}
        </div>
      )}

      {/* Hidden IG gradient keeps the import alive and matches the rest of the app chrome. */}
      <span className="sr-only" style={{ backgroundImage: IG_GRADIENT }}>design</span>
    </div>
  )
}

// ─── Segment button ─────────────────────────────────────────

function ToolSegment({
  icon, label, value, valueStyle, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueStyle?: React.CSSProperties
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex-1 min-w-0 h-[52px] rounded-xl border transition-all flex flex-col items-center justify-center gap-1 px-1 ${
        active
          ? 'bg-[#dc2743] border-[#dc2743] text-white'
          : 'bg-surface-elevated border-border text-foreground hover:border-[#dc2743]/40'
      }`}
    >
      {icon}
      <span className="text-[10px] opacity-80 truncate max-w-full" style={valueStyle}>{value}</span>
    </button>
  )
}

// ─── Icons ──────────────────────────────────────────────────

function FontIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20l6-16h4l6 16M7 14h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SizeIcon() {
  // Big "A" + small "a" — the universal "change text size" glyph.
  return (
    <svg width="16" height="14" viewBox="0 0 24 20" fill="currentColor" aria-hidden="true">
      <text x="0" y="17" fontFamily="'Inter', sans-serif" fontSize="18" fontWeight="800">A</text>
      <text x="14" y="17" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="800">A</text>
    </svg>
  )
}

function WeightIcon() {
  // Three stacked bars — light → regular → bold progression.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="5" width="16" height="1.6" rx="0.8" />
      <rect x="4" y="10.2" width="16" height="3.2" rx="1" />
      <rect x="4" y="16.8" width="16" height="5.2" rx="1.2" />
    </svg>
  )
}

function ColorIcon({ color }: { color: string }) {
  return (
    <span className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ background: color }} />
  )
}

function AlignIcon({ align }: { align: Align }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {align === 'left' && (
        <>
          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="15" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {align === 'center' && (
        <>
          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4" y1="15" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {align === 'right' && (
        <>
          <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="6" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
