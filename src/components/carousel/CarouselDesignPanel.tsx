'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { TITLE_FONTS, type FontOption } from '@/lib/visual/font-pairings-data'
import type { ChannelVisualStyleContext } from '@/lib/visual/visual-style'

/**
 * Typography controls for the carousel viewer.
 *
 * Mirrors the Design step the user used to see before images were rendered,
 * but now lives on the viewer so typography decisions can be made against
 * the actual photos. Auto-saves channel-level visual style on change, then
 * kicks off `POST /restyle-all` so every slide re-composites with the new
 * settings (no AI re-generation — just the text overlay).
 *
 * Per-title/body target model: title font/size/align/weight/color and body
 * font/size/align/weight/color are independently adjustable. Matches the
 * DesignStep's Title/Body target segmented control.
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

interface CarouselDesignPanelProps {
  channelId: string | null
  jobId: string
  /** Called after a save+restyle is kicked off so the viewer can show a re-rendering state. */
  onRestyleStarted?: () => void
}

export function CarouselDesignPanel({ channelId, jobId, onRestyleStarted }: CarouselDesignPanelProps) {
  const [loaded, setLoaded] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<Target>('title')
  const [saving, setSaving] = useState(false)

  const [titleFontId, setTitleFontId] = useState<string>('inter')
  const [titleSizePx, setTitleSizePx] = useState<number>(72)
  const [titleAlign, setTitleAlign] = useState<Align>('left')
  const [titleWeight, setTitleWeight] = useState<number>(800)
  const [titleColor, setTitleColor] = useState<string>('#FFFFFF')

  const [bodyFontId, setBodyFontId] = useState<string>('inter')
  const [bodySizePx, setBodySizePx] = useState<number>(40)
  const [bodyAlign, setBodyAlign] = useState<Align>('left')
  const [bodyWeight, setBodyWeight] = useState<number>(400)
  const [bodyColor, setBodyColor] = useState<string>('#D0D0D0')

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

  // Debounced save: any control change queues a save + restyle ~400ms later.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Skip the very first post-load render so hydrating from the server doesn't
  // trigger a pointless save + restyle round-trip.
  const skipFirstSaveRef = useRef(true)

  const queueSave = useCallback(() => {
    if (!channelId || !loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await fetch(`/api/admin/channels/${channelId}/visual-style`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titleFontId,
            bodyFontId,
            headlineColor: titleColor,
            bodyColor: bodyColor,
            t1FontSizePx: titleSizePx,
            t2FontSizePx: bodySizePx,
          }),
        })
        // Kick off the re-composite for every slide (no AI, just overlay).
        await fetch(`/api/carousel/${jobId}/restyle-all`, { method: 'POST' })
        onRestyleStarted?.()
      } catch {
        // Silent — the polling pipeline on the viewer will still pick up changes.
      } finally {
        setSaving(false)
      }
    }, 400)
  }, [
    channelId, jobId, loaded,
    titleFontId, bodyFontId, titleColor, bodyColor,
    titleSizePx, bodySizePx, onRestyleStarted,
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
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [
    queueSave, loaded,
    titleFontId, titleSizePx, titleAlign, titleWeight, titleColor,
    bodyFontId, bodySizePx, bodyAlign, bodyWeight, bodyColor,
  ])

  const decSize = () => active.setSizePx(Math.max(active.range.min, active.sizePx - active.range.step))
  const incSize = () => active.setSizePx(Math.min(active.range.max, active.sizePx + active.range.step))

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider bg-clip-text text-transparent" style={{ backgroundImage: IG_GRADIENT }}>
            Design
          </span>
          <span className="text-xs text-muted-light">
            Tune typography. Re-composites instantly — no new AI calls.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-muted-light flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
              Saving
            </span>
          )}
          <svg
            className={`w-4 h-4 text-muted-light transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-2 space-y-5 border-t border-border/60">
          {/* Target selector */}
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
                    className={`px-4 h-9 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all ${
                      isActive ? 'bg-[#dc2743]/10 text-[#dc2743]' : 'text-muted-light hover:text-foreground'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: swatch }} />
                    {t === 'title' ? 'Title' : 'Body'}
                  </button>
                )
              })}
            </div>
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
                <div className="min-w-[58px] text-center tabular-nums text-sm font-semibold text-foreground">
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

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">Layout Align</label>
              <div className="inline-flex rounded-xl border-2 border-border p-1">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => active.setAlign(a)}
                    aria-label={`Align ${a}`}
                    className={`w-10 h-9 rounded-lg flex items-center justify-center transition-all ${
                      active.align === a ? 'bg-[#dc2743]/10 text-[#dc2743]' : 'text-muted-light hover:text-foreground'
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
