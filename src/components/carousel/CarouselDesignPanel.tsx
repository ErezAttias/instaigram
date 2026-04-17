'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { TITLE_FONTS, type FontOption } from '@/lib/visual/font-pairings-data'
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style'

/**
 * Typography controls for the carousel viewer.
 *
 * Auto-saves channel visual style + kicks `POST /restyle-all` with a 400ms
 * debounce. Stale responses are dropped by a monotonically-increasing
 * `designVersion`; in-flight requests are aborted on the next change.
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
  /** Called after a save+restyle succeeds so the viewer can refresh. */
  onRestyleStarted?: () => void
}

type SaveState = 'idle' | 'saving' | 'error'

export function CarouselDesignPanel({ channelId, jobId, onRestyleStarted }: CarouselDesignPanelProps) {
  const [loaded, setLoaded] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<Target>('title')
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

  // Load channel visual style on mount so the controls reflect what's saved.
  useEffect(() => {
    if (!channelId) {
      setLoaded(true)
      return
    }
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
      .catch(() => { /* ignore — defaults are fine */ })
      .finally(() => setLoaded(true))
  }, [channelId])

  // Load Google Fonts so the pills render in-face.
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

  // Save coordination: debounce, cancel inflight, drop stale responses.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflightRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const skipFirstSaveRef = useRef(true)

  // Hold the latest onRestyleStarted in a ref so queueSave's identity doesn't
  // churn every parent render — otherwise the effect below would fire on every
  // poll tick and keep toggling `saving` on with no user input.
  const onRestyleStartedRef = useRef(onRestyleStarted)
  useEffect(() => { onRestyleStartedRef.current = onRestyleStarted }, [onRestyleStarted])

  const queueSave = useCallback(() => {
    if (!channelId || !loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      // Cancel any in-flight save — we'll issue a fresh one with current state.
      inflightRef.current?.abort()
      const ctrl = new AbortController()
      inflightRef.current = ctrl
      const myVersion = ++versionRef.current

      setSaveState('saving')
      try {
        const stylePayload = {
          titleFontId,
          bodyFontId,
          headlineColor: titleColor,
          bodyColor: bodyColor,
          t1FontSizePx: titleSizePx,
          t2FontSizePx: bodySizePx,
        }
        const styleRes = await fetch(`/api/admin/channels/${channelId}/visual-style`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stylePayload),
          signal: ctrl.signal,
        })
        if (!styleRes.ok) throw new Error(`style save failed (${styleRes.status})`)

        // If a newer change started while we were saving style, abort now —
        // the next queueSave() will do the restyle with the newer state.
        if (myVersion !== versionRef.current) return

        const restyleRes = await fetch(`/api/carousel/${jobId}/restyle-all`, {
          method: 'POST',
          signal: ctrl.signal,
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

  // Every state change queues a save — except the first render after load
  // (which just applies the server's already-persisted values).
  useEffect(() => {
    if (!loaded) return
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    queueSave()
  }, [
    queueSave, loaded,
    titleFontId, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontId, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  // Cleanup on unmount.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    inflightRef.current?.abort()
  }, [])

  const clampSize = (n: number) => Math.min(active.range.max, Math.max(active.range.min, n))
  const decSize = () => active.setSizePx(clampSize(active.sizePx - active.range.step))
  const incSize = () => active.setSizePx(clampSize(active.sizePx + active.range.step))

  const handleReset = () => {
    setTitleFontId(DEFAULTS.titleFontId)
    setTitleSizePx(DEFAULTS.titleSizePx)
    setTitleAlign(DEFAULTS.titleAlign)
    setTitleWeight(DEFAULTS.titleWeight)
    setTitleColor(DEFAULTS.titleColor)
    setBodyFontId(DEFAULTS.bodyFontId)
    setBodySizePx(DEFAULTS.bodySizePx)
    setBodyAlign(DEFAULTS.bodyAlign)
    setBodyWeight(DEFAULTS.bodyWeight)
    setBodyColor(DEFAULTS.bodyColor)
  }

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        aria-controls="design-panel-body"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider bg-clip-text text-transparent shrink-0" style={{ backgroundImage: IG_GRADIENT }}>
            Design
          </span>
          <span className="text-xs text-muted-light truncate">
            {isOpen ? 'Tune typography. Re-composites instantly — no new AI calls.' : 'Tap to tune typography'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveState === 'saving' && (
            <span className="text-[10px] text-muted-light flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              Saving
            </span>
          )}
          {saveState === 'error' && (
            <span className="text-[10px] text-danger flex items-center gap-1.5" title="Save failed — change something to retry">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              Save failed
            </span>
          )}
          <svg
            className={`w-4 h-4 text-muted-light transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div id="design-panel-body" className="px-4 pb-4 pt-2 space-y-5 border-t border-border/60">
          {/* Target selector + Reset */}
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-1.5 block">Editing</label>
              <div className="inline-flex rounded-xl border-2 border-border p-1">
                {(['title', 'body'] as const).map(t => {
                  const isActive = target === t
                  const swatch = t === 'title' ? titleColor : bodyColor
                  return (
                    <button
                      key={t}
                      onClick={() => setTarget(t)}
                      aria-pressed={isActive}
                      className={`px-4 h-9 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-[#dc2743] text-white shadow-sm ring-1 ring-[#dc2743]'
                          : 'text-muted-light hover:text-foreground'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: swatch }} />
                      {t === 'title' ? 'Title' : 'Body'}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] font-semibold text-muted-light hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Reset design
            </button>
          </div>

          {/* Font */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">
              {target === 'title' ? 'Title Font' : 'Body Font'}
            </label>
            <div className="flex flex-wrap gap-2">
              {TITLE_FONTS.map((f: FontOption) => (
                <button
                  key={f.id}
                  onClick={() => active.setFontId(f.id)}
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    active.fontId === f.id ? 'border-[#dc2743] bg-[#dc2743]/5' : 'border-border hover:border-[#dc2743]/30'
                  }`}
                >
                  <span className="text-sm text-foreground" style={{ fontFamily: `'${f.family}', sans-serif`, fontWeight: f.weight }}>
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Size + Align row */}
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">
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
                <div className="flex items-center">
                  <input
                    type="number"
                    min={active.range.min}
                    max={active.range.max}
                    step={active.range.step}
                    value={active.sizePx}
                    onChange={e => {
                      const raw = parseInt(e.target.value, 10)
                      if (Number.isFinite(raw)) active.setSizePx(clampSize(raw))
                    }}
                    aria-label={target === 'title' ? 'Title size in pixels' : 'Body size in pixels'}
                    className="w-12 text-center bg-transparent tabular-nums text-sm font-semibold text-foreground outline-none focus:ring-1 focus:ring-[#dc2743]/40 rounded-md"
                  />
                  <span className="text-xs text-muted-light">px</span>
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

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">Layout Align</label>
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
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">
              {target === 'title' ? 'Title Weight' : 'Body Weight'}
            </label>
            <div className="flex flex-wrap gap-2">
              {WEIGHTS.map(w => {
                const fontFamilyForPill = target === 'title' ? titleFont.family : bodyFont.family
                return (
                  <button
                    key={w.id}
                    onClick={() => active.setWeight(w.id)}
                    className={`px-3.5 py-2 rounded-xl border-2 transition-all ${
                      active.weight === w.id ? 'border-[#dc2743] bg-[#dc2743]/5' : 'border-border hover:border-[#dc2743]/30'
                    }`}
                  >
                    <span className="text-xs text-foreground" style={{ fontFamily: `'${fontFamilyForPill}', sans-serif`, fontWeight: w.id }}>
                      {w.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">Color Scheme</label>
            <div className="flex flex-wrap gap-2">
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
      )}
    </div>
  )
}

function AlignIcon({ align }: { align: Align }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
