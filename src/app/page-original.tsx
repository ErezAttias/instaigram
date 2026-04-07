'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type NicheMode = 'DISCOVER' | 'EXPLORE' | 'DIRECT'

const MODE_OPTIONS: { value: NicheMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'DISCOVER',
    label: 'Discover niche ideas for me',
    description: 'No idea yet — let AI suggest high-opportunity niches from scratch',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 2l2.4 4.8L18 7.6l-4 3.9.9 5.5-4.9-2.6L5.1 17l.9-5.5-4-3.9 5.6-.8L10 2z" />
      </svg>
    ),
  },
  {
    value: 'EXPLORE',
    label: 'Explore within a topic',
    description: 'You have a broad interest area — AI will find sharp angles within it',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.5 12.5L17 17" />
      </svg>
    ),
  },
  {
    value: 'DIRECT',
    label: 'I already know my topic',
    description: 'Go straight to content generation — optionally refine your topic first',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h12M12 6l4 4-4 4" />
      </svg>
    ),
  },
]

const LOADING_STEPS = [
  'Creating channel...',
  'Setting things up...',
  'Generating niches...',
  'Almost done...',
]

const SAMPLE_SLIDES = [
  { title: '5 AI Tools You\'re\nSleeping On', category: 'AI & Tech', tint: 'bg-orange-500/[0.04]' },
  { title: 'Why 90% of Diets\nFail (Science)', category: 'Health', tint: 'bg-emerald-500/[0.04]' },
  { title: 'The $100K Side\nHustle Blueprint', category: 'Business', tint: 'bg-violet-500/[0.04]' },
]

function getCtaLabel(mode: NicheMode, topic: string): string {
  switch (mode) {
    case 'DISCOVER':
      return 'Discover niches for me'
    case 'EXPLORE':
      return topic.trim() ? `Explore "${topic.trim()}"` : 'Explore topic'
    case 'DIRECT':
      return topic.trim() ? `Start with "${topic.trim()}"` : 'Start creating'
  }
}

function SlideCard({ slide, w, h }: { slide: typeof SAMPLE_SLIDES[number]; w: number; h: number }) {
  return (
    <div
      className="shrink-0 rounded-2xl overflow-hidden relative flex flex-col shadow-lg shadow-black/30"
      style={{ width: w, height: h }}
    >
      <div className="absolute inset-0" />
      <div className="absolute inset-0 border-2 border-white/[0.06] rounded-2xl" />

      {/* IG header */}
      <div className="relative flex items-center gap-2.5 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08]" />
        <div className="flex flex-col gap-0.5">
          <div className="h-2 w-16 bg-white/[0.08] rounded-full" />
          <div className="h-1.5 w-10 bg-white/[0.04] rounded-full" />
        </div>
        <div className="ml-auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20" aria-hidden="true">
            <circle cx="12" cy="6" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="18" r="1" />
          </svg>
        </div>
      </div>

      {/* Slide content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-8 text-center">
        <span className="text-[10px] font-semibold text-accent/40 uppercase tracking-[0.15em] mb-2.5">
          {slide.category}
        </span>
        <p className="text-[22px] font-bold text-white/25 leading-snug whitespace-pre-line">
          {slide.title}
        </p>
      </div>

      {/* IG action bar */}
      <div className="relative flex items-center gap-4 px-4 pt-2 pb-3">
        <div className="flex items-center gap-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </div>
        <div className="ml-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function CarouselPreview() {
  const [index, setIndex] = useState(0)

  const SLIDE_W = 280
  const SLIDE_H = 364
  const GAP = 12
  const STEP = SLIDE_W + GAP
  const COUNT = SAMPLE_SLIDES.length

  // Enough copies that we never run out of slides ahead
  const COPIES = 100
  const manySlides = useMemo(
    () => Array.from({ length: COPIES * COUNT }, (_, i) => SAMPLE_SLIDES[i % COUNT]),
    [],
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => prev + 1)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Carousel viewport */}
      <div className="relative overflow-hidden" style={{ width: SLIDE_W + 80, height: SLIDE_H }}>
        <div
          className="flex absolute top-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: 40,
            gap: GAP,
            transform: `translateX(-${index * STEP}px)`,
          }}
        >
          {manySlides.map((slide, i) => (
            <SlideCard key={i} slide={slide} w={SLIDE_W} h={SLIDE_H} />
          ))}
        </div>
      </div>

      {/* Fade left/right edges */}
      <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [nicheMode, setNicheMode] = useState<NicheMode>('DISCOVER')
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState('')

  const showTopicInput = nicheMode === 'EXPLORE' || nicheMode === 'DIRECT'

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0)
      return
    }
    const interval = setInterval(() => {
      setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s))
    }, 2500)
    return () => clearInterval(interval)
  }, [loading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (showTopicInput && !topic.trim()) {
      setError(nicheMode === 'EXPLORE' ? 'Enter a broad topic to explore' : 'Enter your topic')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheMode,
          ...(nicheMode === 'EXPLORE' && { exploreTopic: topic.trim() }),
          ...(nicheMode === 'DIRECT' && { directTopic: topic.trim() }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create channel')
      }

      const channel = await res.json()
      router.push(`/channels/${channel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] pt-10 lg:pt-16">

      <div className="w-full max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left: Form */}
          <div className="lg:col-span-7 animate-fade-up max-w-[38rem]">
            {/* Header */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/20 bg-accent/[0.06] mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-semibold text-accent uppercase tracking-[0.12em]">
                  New channel
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight leading-[1.1] mb-4">
                Create your <br className="sm:hidden" />
                <span className="bg-gradient-to-r from-accent via-amber-300 to-accent bg-clip-text text-transparent">
                  content channel
                </span>
              </h1>
              <p className="text-muted-light text-base leading-relaxed">
                Your next 30 days of scroll-stopping carousels, ready in minutes.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Niche Mode Selection */}
              <div className="animate-fade-up stagger-1">
                <label className="block text-xs font-semibold text-muted uppercase tracking-[0.12em] mb-3">
                  How do you want to start?
                </label>
                <div className="space-y-2.5" role="radiogroup" aria-label="How do you want to start?">
                  {MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={nicheMode === opt.value}
                      onClick={() => {
                        setNicheMode(opt.value)
                        if (opt.value === 'DISCOVER') setTopic('')
                      }}
                      className={`
                        w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 flex items-start gap-4 group
                        focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none
                        ${nicheMode === opt.value
                          ? 'border-accent/40 bg-accent/[0.08] shadow-[0_0_24px_var(--accent-glow)]'
                          : 'border-border bg-surface/50 hover:border-border-hover hover:bg-surface-elevated/50'
                        }
                      `}
                    >
                      <span className={`mt-0.5 shrink-0 transition-colors ${nicheMode === opt.value ? 'text-accent' : 'text-muted group-hover:text-muted-light'}`}>
                        {opt.icon}
                      </span>
                      <div>
                        <p className={`text-[15px] font-semibold ${nicheMode === opt.value ? 'text-foreground' : 'text-muted-light'}`}>
                          {opt.label}
                        </p>
                        <p className="text-sm text-muted mt-0.5 leading-relaxed">{opt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic Input (Explore / Direct) */}
              {showTopicInput && (
                <div className="animate-fade-up">
                  <label htmlFor="topic" className="block text-xs font-semibold text-muted uppercase tracking-[0.12em] mb-3">
                    {nicheMode === 'EXPLORE' ? 'Broad topic or interest area' : 'Your topic'}
                  </label>
                  <input
                    id="topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={
                      nicheMode === 'EXPLORE'
                        ? 'e.g. AI, football, stoicism, luxury'
                        : 'e.g. AI tools for creators'
                    }
                    className="w-full px-5 py-3.5 bg-surface border border-border rounded-xl text-foreground placeholder-muted text-base hover:border-border-hover"
                  />
                </div>
              )}

              {error && (
                <div className="animate-scale-in px-5 py-3.5 bg-danger-dim border border-danger/20 rounded-xl">
                  <p className="text-sm text-danger font-medium">{error}</p>
                </div>
              )}

              <div className="animate-fade-up stagger-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-5 bg-accent hover:bg-accent-hover text-background font-bold rounded-2xl text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_var(--accent-glow)] hover:shadow-[0_0_36px_var(--accent-glow)] transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2.5">
                      <span className="w-4.5 h-4.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      {LOADING_STEPS[loadingStep]}
                    </span>
                  ) : (
                    getCtaLabel(nicheMode, topic)
                  )}
                </button>
              </div>
            </form>

            {/* Trust badges */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-5">
                {[
                  { label: '30 days', desc: 'of content' },
                  { label: 'AI-powered', desc: 'generation' },
                  { label: 'Ready in', desc: 'minutes' },
                ].map((badge) => (
                  <div key={badge.label} className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{badge.label}</span>
                    <span className="text-xs text-muted">{badge.desc}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-1.5">
                  {['bg-gradient-to-br from-orange-400 to-rose-500', 'bg-gradient-to-br from-blue-400 to-violet-500', 'bg-gradient-to-br from-emerald-400 to-teal-500'].map((bg, i) => (
                    <div
                      key={i}
                      className={`w-5 h-5 rounded-full ${bg} border-[1.5px] border-background`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted">
                  <span className="text-foreground font-medium">500+</span> creators already onboard
                </span>
              </div>
            </div>
          </div>

          {/* Right: Carousel Preview */}
          <div className="lg:col-span-5 animate-fade-up stagger-3 hidden lg:flex items-center justify-center">
            <CarouselPreview />
          </div>
        </div>
      </div>
    </div>
  )
}
