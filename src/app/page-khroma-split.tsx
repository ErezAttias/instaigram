'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { KhromaShell, SERIF, SANS } from '@/components/khroma/KhromaShell'
import { pickThemeForTopic } from '@/components/khroma/themes'
import { LiveCarousel } from '@/components/khroma/LiveCarousel'

const PLACEHOLDER_EXAMPLES = [
  'fitness for busy parents',
  'coffee lovers',
  'AI tools for developers',
  'personal finance tips',
  'travel on a budget',
  'sustainable living',
]

type Phase =
  | 'idle'
  | 'previewing-facts'
  | 'sample-facts'
  | 'creating-job'
  | 'generating-copy'
  | 'copy-review'
  | 'rendering'
  | 'done'

type Slide = {
  slideIndex: number
  role: 'OPENER' | 'FACT' | 'CTA' | string
  headline: string | null
  displayTitle: string | null
  displaySupport: string | null
  imageUrl?: string | null
  status?: string
}

export default function HomeKhromaSplit({ initialJobId }: { initialJobId?: string } = {}) {
  const router = useRouter()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const textMain = isLight ? '#0a0a0a' : '#ffffff'
  const textMuted = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)'

  const [topic, setTopic] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>(initialJobId ? 'generating-copy' : 'idle')
  const [submittedTopic, setSubmittedTopic] = useState('')
  const [sampleFacts, setSampleFacts] = useState<string[]>([])
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [caption, setCaption] = useState<string>('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [regeneratingSet, setRegeneratingSet] = useState<Set<number>>(new Set())
  const [activeSlide, setActiveSlideRaw] = useState(0)
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next')
  const [editTarget, setEditTarget] = useState<'overview' | 'headline' | 'support' | 'image'>('overview')
  const [themeOverrides, setThemeOverrides] = useState<ThemeOverrides>({})
  const setActiveSlide = (next: number | ((prev: number) => number)) => {
    setActiveSlideRaw(prev => {
      const n = typeof next === 'function' ? (next as (p: number) => number)(prev) : next
      if (n === prev) return prev
      const total = slides.length || 1
      // Pick the visually natural direction, accounting for wrap-around.
      const forward = (n - prev + total) % total
      const backward = (prev - n + total) % total
      setSlideDir(forward <= backward ? 'next' : 'prev')
      return n
    })
  }
  const [savingText, setSavingText] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3200)
    return () => clearInterval(t)
  }, [])

  // Bootstrap from an existing job (e.g. when landing at /c/[jobId] directly).
  // Decide the phase based on whether copy is complete and whether every
  // slide already has an image.
  useEffect(() => {
    if (!initialJobId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/carousel/${initialJobId}`)
        const text = await res.text()
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
        if (cancelled) return
        if (Array.isArray(data.slides)) setSlides(data.slides)
        if (data.topic) setSubmittedTopic(data.topic)
        if (typeof data.caption === 'string' && data.caption) setCaption(data.caption)
        if (Array.isArray(data.hashtags)) setHashtags(data.hashtags)
        const copyDone = data.status === 'COMPLETE'
        const hasSlides = Array.isArray(data.slides) && data.slides.length > 0
        const allResolved = hasSlides && data.slides.every((s: Slide) => !!s.imageUrl || s.status === 'FAILED_IMAGE')
        const anyImage = hasSlides && data.slides.some((s: Slide) => !!s.imageUrl)
        if (copyDone && allResolved) setPhase('done')
        else if (copyDone && anyImage) setPhase('rendering')
        else if (copyDone) setPhase('copy-review')
        else setPhase('generating-copy')
      } catch {
        setError('Failed to load carousel')
        setPhase('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialJobId])

  // Poll the job through both copy generation and image rendering. The same
  // endpoint returns slides with imageUrl filled in as each render completes.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!jobId) return
    if (phase !== 'generating-copy' && phase !== 'rendering') return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/carousel/${jobId}`)
        const text = await res.text()
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
        if (cancelled) return
        if (Array.isArray(data.slides) && data.slides.length > 0) {
          setSlides(data.slides)
        }
        if (typeof data.caption === 'string' && data.caption) setCaption(data.caption)
        if (Array.isArray(data.hashtags)) setHashtags(data.hashtags)
        // Copy-generation phase moves to review as soon as the copy is final.
        if (phase === 'generating-copy') {
          if (data.status === 'COMPLETE') {
            if (pollRef.current) clearInterval(pollRef.current)
            setPhase('copy-review')
          } else if (data.status === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current)
            setError('Generation failed. Try a different topic.')
            setPhase('sample-facts')
          }
        }
        // Rendering phase ends when every slide has an imageUrl (or failed).
        if (phase === 'rendering' && Array.isArray(data.slides) && data.slides.length > 0) {
          const allResolved = data.slides.every((s: Slide) => !!s.imageUrl || s.status === 'FAILED_IMAGE')
          if (allResolved) {
            if (pollRef.current) clearInterval(pollRef.current)
            setPhase('done')
          }
        }
      } catch {
        // transient — next tick will retry
      }
    }
    poll()
    pollRef.current = setInterval(poll, 2500)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, jobId])

  async function handleTopicSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = topic.trim()
    if (!t) return
    setSubmittedTopic(t)
    setError(null)
    setSampleFacts([])
    setPhase('previewing-facts')
    try {
      const res = await fetch('/api/carousel/generate-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to preview topic')
      setSampleFacts(Array.isArray(data.sampleFacts) ? data.sampleFacts : [])
      setPhase('sample-facts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview topic')
      setPhase('idle')
    }
  }

  async function startCarousel() {
    setPhase('creating-job')
    setError(null)
    try {
      const res = await fetch('/api/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: submittedTopic,
          direction: submittedTopic,
          skipImages: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.jobId) throw new Error(data.error || 'Failed to start carousel')
      setJobId(data.jobId)
      setSlides([])
      setPhase('generating-copy')
      // Keep the shell mounted but make the URL shareable / refresh-safe.
      router.replace(`/c/${data.jobId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start carousel')
      setPhase('sample-facts')
    }
  }

  // Per-slide image re-roll — kicks off a regenerate on a single slide and
  // polls for a new imageUrl. Independent of the main phase poll so the user
  // can keep re-rolling from the 'done' state without leaving the shell.
  const regenPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const regenPrevUrlsRef = useRef<Map<number, string | null>>(new Map())
  async function regenerateSlideImage(slideIndex: number) {
    if (!jobId) return
    // Stash the current imageUrl so we can tell when it swaps.
    const prev = slides.find(s => s.slideIndex === slideIndex)?.imageUrl ?? null
    regenPrevUrlsRef.current.set(slideIndex, prev)
    setRegeneratingSet(prev => {
      const next = new Set(prev)
      next.add(slideIndex)
      return next
    })
    try {
      await fetch(`/api/carousel/${jobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex, mode: 'image' }),
      })
    } catch {
      // Treat failure as "done" so the user isn't stuck — they can retry.
      setRegeneratingSet(prev => {
        const next = new Set(prev)
        next.delete(slideIndex)
        return next
      })
      return
    }
    // Make sure a regen poller is running.
    if (!regenPollRef.current) {
      regenPollRef.current = setInterval(async () => {
        if (!jobId) return
        try {
          const res = await fetch(`/api/carousel/${jobId}`)
          const text = await res.text()
          const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ' '))
          if (Array.isArray(data.slides)) setSlides(data.slides)
          // Clear indices whose imageUrl has changed.
          setRegeneratingSet(prev => {
            const next = new Set(prev)
            for (const idx of prev) {
              const s = (data.slides as Slide[] | undefined)?.find(x => x.slideIndex === idx)
              const prevUrl = regenPrevUrlsRef.current.get(idx) ?? null
              if (s && (s.imageUrl ?? null) !== prevUrl && s.imageUrl) {
                next.delete(idx)
                regenPrevUrlsRef.current.delete(idx)
              } else if (s && s.status === 'FAILED_IMAGE') {
                next.delete(idx)
                regenPrevUrlsRef.current.delete(idx)
              }
            }
            if (next.size === 0 && regenPollRef.current) {
              clearInterval(regenPollRef.current)
              regenPollRef.current = null
            }
            return next
          })
        } catch {
          // transient
        }
      }, 2500)
    }
  }

  useEffect(() => () => {
    if (regenPollRef.current) clearInterval(regenPollRef.current)
  }, [])

  // Arrow-key slide navigation in the done phase. Ignore while typing in an
  // input/textarea so editing the headline doesn't jump slides.
  useEffect(() => {
    if (phase !== 'done' || slides.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      setActiveSlide(prev => {
        const n = slides.length
        return e.key === 'ArrowRight' ? (prev + 1) % n : (prev - 1 + n) % n
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, slides.length])

  async function regenerateCopy() {
    if (!jobId) return
    setPhase('creating-job')
    try {
      const res = await fetch('/api/carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: submittedTopic,
          direction: submittedTopic,
          skipImages: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.jobId) throw new Error(data.error || 'Failed to regenerate')
      setJobId(data.jobId)
      setSlides([])
      setPhase('generating-copy')
      router.replace(`/c/${data.jobId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
      setPhase('copy-review')
    }
  }

  async function approveCopy() {
    if (!jobId) return
    setPhase('rendering')
    try {
      const pRes = await fetch(`/api/carousel/${jobId}/preview-prompts`)
      const pData = await pRes.json().catch(() => ({}))
      const previews: Array<{ slideIndex: number; imagePrompt: string; wikipediaQuery: string | null }>
        = pData?.previews ?? []
      await fetch(`/api/carousel/${jobId}/render-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: previews.map(p => ({
            slideIndex: p.slideIndex,
            source: 'ai' as const,
            prompt: p.imagePrompt,
            wikipediaQuery: p.wikipediaQuery ?? undefined,
          })),
        }),
      })
      // Stay in 'rendering' — the main poll flips to 'done' once every
      // slide has its imageUrl (or FAILED_IMAGE).
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render images')
      setPhase('copy-review')
    }
  }

  async function saveSlideText(slideIndex: number, patch: { displayTitle?: string; displaySupport?: string }) {
    if (!jobId) return
    setSavingText(true)
    try {
      await fetch(`/api/carousel/${jobId}/slides/${slideIndex}/update-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSlides(prev => prev.map(s =>
        s.slideIndex === slideIndex
          ? { ...s, displayTitle: patch.displayTitle ?? s.displayTitle, displaySupport: patch.displaySupport ?? s.displaySupport }
          : s,
      ))
    } catch {
      // keep local edit regardless; user can retry
    } finally {
      setSavingText(false)
    }
  }

  const [downloading, setDownloading] = useState(false)
  async function downloadCarousel() {
    if (!jobId) return
    setDownloading(true)
    setError(null)
    try {
      await fetch(`/api/carousel/${jobId}/approve`, { method: 'POST' })
      const res = await fetch(`/api/carousel/${jobId}/export`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carousel_${jobId.slice(0, 8)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  function resetToIdle() {
    setPhase('idle')
    setSubmittedTopic('')
    setSampleFacts([])
    setJobId(null)
    setSlides([])
    setError(null)
    if (pollRef.current) clearInterval(pollRef.current)
    router.replace('/')
  }

  function goBackToSampleFacts() {
    setPhase('sample-facts')
    setJobId(null)
    setSlides([])
    if (pollRef.current) clearInterval(pollRef.current)
  }

  // Right-column preview swaps theme as the topic becomes more concrete.
  const previewSeed = submittedTopic || 'seed'
  const preview = phase === 'idle' ? undefined : pickThemeForTopic(previewSeed)

  // Once we have real slides, show them in the right column instead of the
  // demo-theme floating carousel.
  const showLiveCarousel =
    (phase === 'copy-review' || phase === 'rendering' || phase === 'done') && slides.length > 0
  const baseLiveTheme = preview ?? pickThemeForTopic(previewSeed)
  const livePreviewTheme = { ...baseLiveTheme, ...themeOverrides }
  const rightContent = showLiveCarousel ? (
    <LiveCarousel
      slides={slides}
      theme={livePreviewTheme}
      username={submittedTopic.toLowerCase().replace(/\s+/g, '.').slice(0, 20) || livePreviewTheme.username}
      autoCycle={phase === 'rendering'}
      activeIndex={phase === 'done' ? activeSlide : undefined}
      onActiveChange={phase === 'done' ? setActiveSlide : undefined}
      slideDirection={phase === 'done' ? slideDir : undefined}
      onRegenerateSlide={phase === 'done' ? regenerateSlideImage : undefined}
      onEditElement={phase === 'done' ? (which) => setEditTarget(which) : undefined}
      regeneratingSet={regeneratingSet}
    />
  ) : undefined

  const renderedCount = slides.filter(s => !!s.imageUrl).length
  const totalCount = slides.length

  return (
    <KhromaShell preview={preview} rightContent={rightContent}>
      <div key={phase} className="phase-panel">
        {phase === 'idle' && (
          <>
            <h1
              className="mb-8"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(3.75rem, 7vw, 6.75rem)',
                lineHeight: 0.98,
                letterSpacing: '-0.015em',
              }}
            >
              Design carousels
              <br />
              <span style={{ fontStyle: 'italic' }}>you love</span> to post.
            </h1>

            <p
              className="mb-10 max-w-[28rem]"
              style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}
            >
              Type a topic — InstAIgram generates the facts, the copy, and the imagery.
              You stay in the driver&rsquo;s seat.
            </p>

            <form onSubmit={handleTopicSubmit} className="flex flex-col gap-4 items-start">
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                autoComplete="off"
                className="w-full max-w-[28rem] px-4 py-3 text-base focus:outline-none rounded-md transition-colors"
                style={{
                  fontFamily: SANS,
                  background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                  color: textMain,
                  border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                }}
              />
              <button
                type="submit"
                disabled={!topic.trim()}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                Preview
              </button>

              {error && (
                <div className="px-4 py-2.5 bg-danger/15 border border-danger/30 rounded-md">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}
            </form>
          </>
        )}

        {phase === 'previewing-facts' && (
          <>
            <p className="mb-6 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Step 01 — Sampling the topic
            </p>
            <h1
              className="mb-8"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(3rem, 5.4vw, 4.75rem)',
                lineHeight: 1,
                letterSpacing: '-0.015em',
              }}
            >
              Pulling facts for <span style={{ fontStyle: 'italic' }}>{submittedTopic}</span>
              <span className="dots">…</span>
            </h1>
            <p className="mb-10 max-w-[28rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}>
              A quick taste of the kind of facts the full carousel will use. Takes a few seconds.
            </p>
            <div className="flex items-center gap-3" style={{ color: textMuted, fontFamily: SANS }}>
              <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span className="text-sm">Thinking…</span>
            </div>
          </>
        )}

        {phase === 'sample-facts' && (
          <>
            <p className="mb-5 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              A preview of {submittedTopic}
            </p>
            <h1
              className="mb-4"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              Does this feel <span style={{ fontStyle: 'italic' }}>right</span>?
            </h1>
            <p className="mb-6 max-w-[30rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '15px', lineHeight: 1.55 }}>
              Sample facts, not the real ones — the actual carousel will have its own unique set.
              If the vibe is off, change the topic.
            </p>

            <ul className="flex flex-col gap-3 max-h-[48vh] overflow-y-auto pr-2 -mr-2">
              {sampleFacts.map((fact, i) => (
                <li
                  key={i}
                  className="p-4 rounded-xl flex items-start gap-3"
                  style={{
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <span className="shrink-0 text-[11px] font-mono tabular-nums mt-1 opacity-50" style={{ color: textMuted }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[15px] leading-relaxed" style={{ color: textMain, fontFamily: SANS }}>
                    {fact}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-5 flex-wrap">
              <button
                type="button"
                onClick={startCarousel}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                Generate carousel →
              </button>
              <button
                type="button"
                onClick={resetToIdle}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                ← Change topic
              </button>
            </div>

            {error && (
              <div className="mt-4 px-4 py-2.5 bg-danger/15 border border-danger/30 rounded-md">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
          </>
        )}

        {(phase === 'creating-job' || phase === 'generating-copy') && (
          <>
            <p className="mb-6 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Step 02 — Writing the carousel
            </p>
            <h1
              className="mb-8"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2.75rem, 4.8vw, 4rem)',
                lineHeight: 1.02,
                letterSpacing: '-0.015em',
              }}
            >
              Drafting slides for <span style={{ fontStyle: 'italic' }}>{submittedTopic}</span>
              <span className="dots">…</span>
            </h1>

            <ul className="flex flex-col gap-3 mt-6">
              {Array.from({ length: Math.max(6, slides.length) }).map((_, i) => {
                const s = slides[i]
                return (
                  <li
                    key={i}
                    className="p-4 rounded-xl"
                    style={{
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {s ? (
                      <>
                        <div className="text-[10px] uppercase tracking-wider mb-1.5 opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                          {s.role} · {i + 1} / {slides.length}
                        </div>
                        <p className="text-[15px] font-semibold leading-snug" style={{ color: textMain, fontFamily: SANS }}>
                          {s.displayTitle || s.headline}
                        </p>
                        {s.displaySupport && (
                          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: textMuted, fontFamily: SANS }}>
                            {s.displaySupport}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="animate-pulse">
                        <div className="h-3 rounded w-2/5 mb-2" style={{ background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }} />
                        <div className="h-4 rounded w-3/4 mb-1.5" style={{ background: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)' }} />
                        <div className="h-3 rounded w-full" style={{ background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {phase === 'copy-review' && (
          <>
            <p className="mb-5 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Step 02 — Review the carousel
            </p>
            <h1
              className="mb-4"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2.25rem, 3.6vw, 3.25rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              {slides.length} slides for <span style={{ fontStyle: 'italic' }}>{submittedTopic}</span>.
            </h1>
            <p className="mb-6 max-w-[30rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '15px', lineHeight: 1.55 }}>
              Approve to render imagery. Regenerate for a different draft.
            </p>

            <ul className="flex flex-col gap-3 max-h-[48vh] overflow-y-auto pr-2 -mr-2">
              {slides.map(s => (
                <li
                  key={s.slideIndex}
                  className="p-4 rounded-xl"
                  style={{
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider mb-1.5 opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                    {s.role} · {s.slideIndex + 1} / {slides.length}
                  </div>
                  <p className="text-[15px] font-semibold leading-snug" style={{ color: textMain, fontFamily: SANS }}>
                    {s.displayTitle || s.headline}
                  </p>
                  {s.displaySupport && (
                    <p className="text-[13px] mt-1 leading-relaxed" style={{ color: textMuted, fontFamily: SANS }}>
                      {s.displaySupport}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-5 flex-wrap">
              <button
                type="button"
                onClick={approveCopy}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                Approve copy →
              </button>
              <button
                type="button"
                onClick={regenerateCopy}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={goBackToSampleFacts}
                className="text-sm font-medium underline-offset-4 hover:underline opacity-70"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                ← Back
              </button>
            </div>
          </>
        )}

        {phase === 'rendering' && (
          <>
            <p className="mb-6 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Step 03 — Rendering imagery
            </p>
            <h1
              className="mb-8"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(3rem, 5.4vw, 4.75rem)',
                lineHeight: 1,
                letterSpacing: '-0.015em',
              }}
            >
              Painting <span style={{ fontStyle: 'italic' }}>the visuals</span>
              <span className="dots">…</span>
            </h1>
            <p className="mb-8 max-w-[28rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}>
              Each slide&rsquo;s imagery is being generated. Watch the card on the right fill in as they land.
            </p>

            <div
              className="max-w-[30rem] rounded-xl p-4"
              style={{
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-[0.18em] opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                  Progress
                </span>
                <span className="text-[12px] font-mono tabular-nums" style={{ color: textMuted, fontFamily: SANS }}>
                  {renderedCount} / {totalCount}
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: totalCount ? `${(renderedCount / totalCount) * 100}%` : '0%',
                    background: 'linear-gradient(90deg, #f09433, #dc2743)',
                  }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: textMuted, fontFamily: SANS }}>
                <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                <span>Rendering slide {Math.min(renderedCount + 1, totalCount || 1)}…</span>
              </div>
            </div>
          </>
        )}

        {phase === 'done' && jobId && (
          <>
            <p className="mb-4 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Carousel ready — edit freely
            </p>
            <h1
              className="mb-6"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: textMain,
                fontSize: 'clamp(2rem, 3vw, 2.75rem)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
              }}
            >
              Your <span style={{ fontStyle: 'italic' }}>{submittedTopic}</span> carousel.
            </h1>

            <SlideEditor
              jobId={jobId}
              slides={slides}
              activeSlide={activeSlide}
              setActiveSlide={setActiveSlide}
              onSave={saveSlideText}
              saving={savingText}
              editTarget={editTarget}
              setEditTarget={setEditTarget}
              onRegenerateSlide={regenerateSlideImage}
              regeneratingSet={regeneratingSet}
              themeOverrides={themeOverrides}
              setThemeOverrides={setThemeOverrides}
              isLight={isLight}
              textMain={textMain}
              textMuted={textMuted}
            />

            {caption && (
              <div
                className="mb-6 rounded-xl p-4 max-w-[34rem]"
                style={{
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                    Caption
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(`${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`.trim())}
                    className="text-[11px] opacity-70 hover:opacity-100 underline-offset-2 hover:underline"
                    style={{ color: textMuted, fontFamily: SANS }}
                  >
                    Copy
                  </button>
                </div>
                <p
                  className="text-[14px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: textMain, fontFamily: SANS }}
                >
                  {caption}
                </p>
                {hashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hashtags.map((h, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          color: textMuted,
                          background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                          fontFamily: SANS,
                        }}
                      >
                        #{h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-5 flex-wrap">
              <button
                type="button"
                onClick={downloadCarousel}
                disabled={downloading}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                {downloading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>Download carousel ↓</>
                )}
              </button>
              <button
                type="button"
                onClick={resetToIdle}
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: textMuted, fontFamily: SANS }}
              >
                Start another
              </button>
            </div>
            {error && (
              <div className="mt-4 px-4 py-2.5 bg-danger/15 border border-danger/30 rounded-md max-w-[34rem]">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
          </>
        )}
      </div>
    </KhromaShell>
  )
}

function BackButton({ onClick, textMuted }: { onClick: () => void; textMuted: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-medium underline-offset-4 hover:underline opacity-70 hover:opacity-100 transition-opacity"
      style={{ color: textMuted, fontFamily: SANS }}
    >
      ← Back
    </button>
  )
}

function AutoTextarea({
  value,
  onChange,
  onBlur,
  style,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  style: React.CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      style={style}
    />
  )
}

type ThemeOverrides = {
  headlineFont?: string
  headlineWeight?: number
  headlineSizePx?: number
  italic?: boolean
  fg?: string
  accent?: string
  supportFont?: string
  supportWeight?: number
  supportSizePx?: number
  supportItalic?: boolean
  supportColor?: string
}

function SlideEditor({
  jobId,
  slides,
  activeSlide,
  setActiveSlide,
  onSave,
  saving,
  editTarget,
  setEditTarget,
  onRegenerateSlide,
  regeneratingSet,
  themeOverrides,
  setThemeOverrides,
  isLight,
  textMain,
  textMuted,
}: {
  jobId: string
  slides: Slide[]
  activeSlide: number
  setActiveSlide: (i: number) => void
  onSave: (slideIndex: number, patch: { displayTitle?: string; displaySupport?: string }) => void
  saving: boolean
  editTarget: 'overview' | 'headline' | 'support' | 'image'
  setEditTarget: (t: 'overview' | 'headline' | 'support' | 'image') => void
  onRegenerateSlide: (slideIndex: number) => void
  regeneratingSet: Set<number>
  themeOverrides: ThemeOverrides
  setThemeOverrides: React.Dispatch<React.SetStateAction<ThemeOverrides>>
  isLight: boolean
  textMain: string
  textMuted: string
}) {
  const clamped = Math.min(activeSlide, Math.max(0, slides.length - 1))
  const current = slides[clamped]
  const [title, setTitle] = useState(current?.displayTitle ?? current?.headline ?? '')
  const [support, setSupport] = useState(current?.displaySupport ?? '')
  const [justSaved, setJustSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(current?.displayTitle ?? current?.headline ?? '')
    setSupport(current?.displaySupport ?? '')
  }, [current?.slideIndex, current?.displayTitle, current?.displaySupport, current?.headline])

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  if (!current) return null

  const commit = () => {
    const patch: { displayTitle?: string; displaySupport?: string } = {}
    if (title !== (current.displayTitle ?? current.headline ?? '')) patch.displayTitle = title
    if (support !== (current.displaySupport ?? '')) patch.displaySupport = support
    if (patch.displayTitle !== undefined || patch.displaySupport !== undefined) {
      onSave(current.slideIndex, patch)
      setJustSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 2000)
    }
  }

  const fieldStyle: React.CSSProperties = {
    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textMain,
    fontFamily: SANS,
    borderRadius: 10,
    padding: '10px 12px',
    width: '100%',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
  }

  return (
    <div className="mb-6 max-w-[34rem]">
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => setActiveSlide((clamped - 1 + slides.length) % slides.length)}
          aria-label="Previous slide"
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[15px] transition-colors"
          style={{
            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
            color: textMain,
            fontFamily: SANS,
          }}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => setActiveSlide((clamped + 1) % slides.length)}
          aria-label="Next slide"
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[15px] transition-colors"
          style={{
            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
            color: textMain,
            fontFamily: SANS,
          }}
        >
          →
        </button>
        <span className="text-[12px] uppercase tracking-[0.18em] opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
          Slide {clamped + 1} of {slides.length}
        </span>
      </div>

      <div key={`panel-${editTarget}-${current.slideIndex}`} className="crossfade">
        {editTarget === 'overview' && (
          <>
            <label className="block mb-4">
              <span className="block text-[11px] uppercase tracking-[0.16em] mb-1.5 opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                Headline
              </span>
              <AutoTextarea value={title} onChange={setTitle} onBlur={commit} style={fieldStyle} />
            </label>

            {current.role !== 'OPENER' && current.role !== 'CTA' && (
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.16em] mb-1.5 opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
                  Supporting text
                </span>
                <AutoTextarea value={support} onChange={setSupport} onBlur={commit} style={fieldStyle} />
              </label>
            )}
          </>
        )}

        {editTarget === 'headline' && (
          <TextDesignPanel
            title="Headline — design"
            fontKey="headlineFont"
            weightKey="headlineWeight"
            sizeKey="headlineSizePx"
            italicKey="italic"
            colorKey="fg"
            overrides={themeOverrides}
            setOverrides={setThemeOverrides}
            onBack={() => setEditTarget('overview')}
            isLight={isLight}
            textMain={textMain}
            textMuted={textMuted}
          />
        )}

        {editTarget === 'support' && (
          <TextDesignPanel
            title={current.role === 'OPENER' || current.role === 'CTA' ? 'Call to action — design' : 'Paragraph — design'}
            fontKey="supportFont"
            weightKey="supportWeight"
            sizeKey="supportSizePx"
            italicKey="supportItalic"
            colorKey="supportColor"
            overrides={themeOverrides}
            setOverrides={setThemeOverrides}
            onBack={() => setEditTarget('overview')}
            isLight={isLight}
            textMain={textMain}
            textMuted={textMuted}
          />
        )}

        {editTarget === 'image' && (
          <ImageDesignPanel
            jobId={jobId}
            slide={current}
            regenerating={regeneratingSet.has(current.slideIndex)}
            onRegenerateSlide={onRegenerateSlide}
            onBack={() => setEditTarget('overview')}
            isLight={isLight}
            textMain={textMain}
            textMuted={textMuted}
          />
        )}
      </div>

      <div className="mt-2 text-[11px] h-4 transition-opacity duration-300" style={{ color: textMuted, fontFamily: SANS, opacity: saving || justSaved ? 1 : 0 }}>
        {saving ? 'Saving…' : justSaved ? 'Changes saved' : ''}
      </div>
    </div>
  )
}

const HEADLINE_FONTS = [
  { label: 'Instrument Serif', value: "'Instrument Serif', 'Times New Roman', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Roboto Slab', value: "'Roboto Slab', Georgia, serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
]
const HEADLINE_WEIGHTS = [400, 500, 700, 800]
const TEXT_COLOR_SWATCHES = ['#FFFFFF', '#F5F1EA', '#0A0A0A', '#F09433', '#DC2743', '#2563EB']

const SIZE_DEFAULTS: Record<'headlineSizePx' | 'supportSizePx', number> = {
  headlineSizePx: 28,
  supportSizePx: 13,
}
const SIZE_RANGES: Record<'headlineSizePx' | 'supportSizePx', { min: number; max: number; step: number }> = {
  headlineSizePx: { min: 16, max: 48, step: 1 },
  supportSizePx:  { min: 10, max: 22, step: 1 },
}

function TextDesignPanel({
  title,
  fontKey,
  weightKey,
  sizeKey,
  italicKey,
  colorKey,
  overrides,
  setOverrides,
  onBack,
  isLight,
  textMain,
  textMuted,
}: {
  title: string
  fontKey: 'headlineFont' | 'supportFont'
  weightKey: 'headlineWeight' | 'supportWeight'
  sizeKey: 'headlineSizePx' | 'supportSizePx'
  italicKey: 'italic' | 'supportItalic'
  colorKey: 'fg' | 'supportColor'
  overrides: ThemeOverrides
  setOverrides: React.Dispatch<React.SetStateAction<ThemeOverrides>>
  onBack: () => void
  isLight: boolean
  textMain: string
  textMuted: string
}) {
  const currentFont = overrides[fontKey]
  const currentWeight = overrides[weightKey]
  const currentSize = overrides[sizeKey] ?? SIZE_DEFAULTS[sizeKey]
  const currentItalic = overrides[italicKey]
  const currentColor = overrides[colorKey] ?? ''
  const sizeRange = SIZE_RANGES[sizeKey]
  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    borderRadius: 8,
    fontFamily: SANS,
    fontSize: 12,
    border: `1px solid ${active ? (isLight ? '#0a0a0a' : '#ffffff') : (isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)')}`,
    background: active ? (isLight ? '#0a0a0a' : '#ffffff') : 'transparent',
    color: active ? (isLight ? '#ffffff' : '#0a0a0a') : textMain,
    cursor: 'pointer',
    transition: 'all 180ms',
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] uppercase tracking-[0.16em] opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
          {title}
        </span>
        <BackButton onClick={onBack} textMuted={textMuted} />
      </div>

      <div className="mb-5">
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Font
        </span>
        <div className="flex flex-wrap gap-2">
          {HEADLINE_FONTS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setOverrides(o => ({ ...o, [fontKey]: f.value }))}
              style={{ ...pillStyle(currentFont === f.value), fontFamily: f.value }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Weight
        </span>
        <div className="flex flex-wrap gap-2">
          {HEADLINE_WEIGHTS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setOverrides(o => ({ ...o, [weightKey]: w }))}
              style={{ ...pillStyle(currentWeight === w), fontWeight: w }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="block text-[11px] uppercase tracking-[0.14em] opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
            Size
          </span>
          <span className="text-[11px] opacity-60 tabular-nums" style={{ color: textMuted, fontFamily: SANS }}>
            {currentSize}px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOverrides(o => ({ ...o, [sizeKey]: Math.max(sizeRange.min, (o[sizeKey] ?? SIZE_DEFAULTS[sizeKey]) - sizeRange.step) }))}
            disabled={currentSize <= sizeRange.min}
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
              background: 'transparent', color: textMain, fontFamily: SANS, fontSize: 18,
              cursor: currentSize <= sizeRange.min ? 'not-allowed' : 'pointer', opacity: currentSize <= sizeRange.min ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >−</button>
          <input
            type="range"
            min={sizeRange.min}
            max={sizeRange.max}
            step={sizeRange.step}
            value={currentSize}
            onChange={e => setOverrides(o => ({ ...o, [sizeKey]: Number(e.target.value) }))}
            style={{ flex: 1, accentColor: isLight ? '#0a0a0a' : '#ffffff' }}
          />
          <button
            type="button"
            onClick={() => setOverrides(o => ({ ...o, [sizeKey]: Math.min(sizeRange.max, (o[sizeKey] ?? SIZE_DEFAULTS[sizeKey]) + sizeRange.step) }))}
            disabled={currentSize >= sizeRange.max}
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
              background: 'transparent', color: textMain, fontFamily: SANS, fontSize: 18,
              cursor: currentSize >= sizeRange.max ? 'not-allowed' : 'pointer', opacity: currentSize >= sizeRange.max ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >+</button>
        </div>
      </div>

      <div className="mb-5">
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Style
        </span>
        <button
          type="button"
          onClick={() => setOverrides(o => ({ ...o, [italicKey]: !o[italicKey] }))}
          style={{ ...pillStyle(!!currentItalic), fontStyle: 'italic' }}
        >
          Italic
        </button>
      </div>

      <div className="mb-2">
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Color
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {TEXT_COLOR_SWATCHES.map(c => {
            const active = currentColor.toLowerCase() === c.toLowerCase()
            return (
              <button
                key={c}
                type="button"
                onClick={() => setOverrides(o => ({ ...o, [colorKey]: c }))}
                aria-label={`Color ${c}`}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  border: `2px solid ${active ? (isLight ? '#0a0a0a' : '#ffffff') : 'rgba(127,127,127,0.25)'}`,
                }}
              />
            )
          })}
          <button
            type="button"
            onClick={() => setOverrides(o => {
              const next = { ...o }
              delete next[fontKey]
              delete next[weightKey]
              delete next[sizeKey]
              delete next[italicKey]
              delete next[colorKey]
              return next
            })}
            className="ml-2 text-[11px] underline-offset-4 hover:underline opacity-70"
            style={{ color: textMuted, fontFamily: SANS }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

type WikiResult = { imageUrl: string; title?: string; pageUrl?: string }

function ImageDesignPanel({
  jobId,
  slide,
  regenerating,
  onRegenerateSlide,
  onBack,
  isLight,
  textMain,
  textMuted,
}: {
  jobId: string
  slide: Slide
  regenerating: boolean
  onRegenerateSlide: (slideIndex: number) => void
  onBack: () => void
  isLight: boolean
  textMain: string
  textMuted: string
}) {
  const [prompt, setPrompt] = useState('')
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiResult, setWikiResult] = useState<WikiResult | null>(null)
  const [wikiError, setWikiError] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/carousel/${jobId}/preview-prompts`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        const hit = (data?.previews ?? []).find((p: { slideIndex: number }) => p.slideIndex === slide.slideIndex)
        if (hit) {
          setPrompt(hit.imagePrompt ?? '')
          setWikiQuery(hit.wikipediaQuery ?? '')
        }
      } catch {
        // no-op
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jobId, slide.slideIndex])

  async function reRollWithPrompt() {
    setBusy(true)
    try {
      await fetch(`/api/carousel/${jobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex: slide.slideIndex, mode: 'image', promptOverride: prompt }),
      })
      onRegenerateSlide(slide.slideIndex)
    } finally {
      setBusy(false)
    }
  }

  async function searchWiki() {
    const q = wikiQuery.trim()
    if (!q) return
    setWikiLoading(true)
    setWikiError(null)
    setWikiResult(null)
    try {
      const res = await fetch(`/api/wikipedia-search?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWikiError(data?.error ?? 'Search failed')
      } else {
        setWikiResult({ imageUrl: data.imageUrl, title: data.title, pageUrl: data.pageUrl })
      }
    } catch (err) {
      setWikiError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setWikiLoading(false)
    }
  }

  async function useWikiImage() {
    if (!wikiResult) return
    setBusy(true)
    try {
      await fetch(`/api/carousel/${jobId}/regenerate-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideIndex: slide.slideIndex,
          mode: 'image',
          imageSource: 'wikipedia',
          wikipediaImageUrl: wikiResult.imageUrl,
          wikipediaQuery: wikiQuery.trim(),
        }),
      })
      onRegenerateSlide(slide.slideIndex)
    } finally {
      setBusy(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textMain,
    fontFamily: SANS,
    borderRadius: 10,
    padding: '10px 12px',
    width: '100%',
    outline: 'none',
    fontSize: 13,
    lineHeight: 1.45,
    resize: 'none',
    overflow: 'hidden',
  }

  const buttonStyle: React.CSSProperties = {
    background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: textMain,
    fontFamily: SANS,
  }

  const disabled = busy || regenerating

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] uppercase tracking-[0.16em] opacity-70" style={{ color: textMuted, fontFamily: SANS }}>
          Image — design
        </span>
        <BackButton onClick={onBack} textMuted={textMuted} />
      </div>

      <div className="mb-6">
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Prompt
        </span>
        <AutoTextarea value={prompt} onChange={setPrompt} onBlur={() => { /* commit on action */ }} style={fieldStyle} />
        <button
          type="button"
          onClick={reRollWithPrompt}
          disabled={disabled || prompt.trim().length === 0}
          className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-md text-[13px] font-medium transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          style={buttonStyle}
        >
          {disabled ? (
            <>
              <span className="w-3.5 h-3.5 border-[1.5px] border-current/30 border-t-current rounded-full animate-spin" />
              Re-rolling…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Re-roll with this prompt
            </>
          )}
        </button>
      </div>

      <div>
        <span className="block text-[11px] uppercase tracking-[0.14em] mb-2 opacity-60" style={{ color: textMuted, fontFamily: SANS }}>
          Wikipedia image
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={wikiQuery}
            onChange={e => setWikiQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchWiki() } }}
            placeholder="Search Wikipedia…"
            style={{ ...fieldStyle, padding: '8px 12px' }}
          />
          <button
            type="button"
            onClick={searchWiki}
            disabled={wikiLoading || wikiQuery.trim().length === 0}
            className="h-10 px-4 rounded-md text-[13px] font-medium transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
            style={buttonStyle}
          >
            {wikiLoading ? '…' : 'Search'}
          </button>
        </div>

        {wikiError && (
          <p className="mt-2 text-[12px]" style={{ color: '#f87171', fontFamily: SANS }}>{wikiError}</p>
        )}

        {wikiResult && (
          <div
            className="mt-3 rounded-xl overflow-hidden flex items-stretch gap-3 p-3"
            style={{
              background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <img src={wikiResult.imageUrl} alt={wikiResult.title ?? ''} className="w-20 h-20 object-cover rounded-md shrink-0" />
            <div className="flex flex-col justify-between min-w-0 flex-1">
              <div className="min-w-0">
                <p className="text-[12px] truncate" style={{ color: textMain, fontFamily: SANS }}>{wikiResult.title ?? 'Result'}</p>
                {wikiResult.pageUrl && (
                  <a href={wikiResult.pageUrl} target="_blank" rel="noreferrer" className="text-[11px] opacity-70 underline-offset-2 hover:underline truncate block" style={{ color: textMuted, fontFamily: SANS }}>
                    View on Wikipedia ↗
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={useWikiImage}
                disabled={disabled}
                className="self-start mt-2 inline-flex items-center gap-2 h-8 px-3 rounded-md text-[12px] font-medium transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                style={buttonStyle}
              >
                Use this image
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
