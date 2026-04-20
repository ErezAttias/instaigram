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
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render images')
      setPhase('copy-review')
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
  const livePreviewTheme = preview ?? pickThemeForTopic(previewSeed)
  const rightContent = showLiveCarousel ? (
    <LiveCarousel
      slides={slides}
      theme={livePreviewTheme}
      username={submittedTopic.toLowerCase().replace(/\s+/g, '.').slice(0, 20) || livePreviewTheme.username}
      autoCycle={phase === 'rendering'}
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
            <p className="mb-6 uppercase tracking-[0.22em] text-[11px]" style={{ color: textMuted, fontFamily: SANS, fontWeight: 600 }}>
              Carousel ready
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
              Your <span style={{ fontStyle: 'italic' }}>{submittedTopic}</span> carousel.
            </h1>
            <p className="mb-10 max-w-[28rem]" style={{ color: textMuted, fontFamily: SANS, fontSize: '16px', lineHeight: 1.6 }}>
              Open the editor to review the images as they come in, swap any you don&rsquo;t like,
              and export when you&rsquo;re happy.
            </p>
            <div className="flex items-center gap-5 flex-wrap">
              <button
                type="button"
                onClick={() => router.push(`/carousel/${jobId}`)}
                className="h-12 px-8 text-white font-medium rounded-md text-[15px] transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: '#2563eb', fontFamily: SANS, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
              >
                Open editor →
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
          </>
        )}
      </div>
    </KhromaShell>
  )
}
